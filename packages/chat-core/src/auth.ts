import { betterAuth, type BetterAuthOptions } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { emailOTP } from "better-auth/plugins/email-otp"
import { signInMail } from "./sign-in-mail.js"
export { signInMail, linkMinutes } from "./sign-in-mail.js"
import { linkMinutes } from "./sign-in-mail.js"
import * as z from "zod"
import { UserId } from "./ids.js"

export type Auth = {
  readonly user: (request: Request) => Promise<UserId | undefined>
  readonly handle: (request: Request) => Promise<Response>
}

export type Mail = { readonly to: string; readonly subject: string; readonly text: string; readonly html?: string }

export type Sender = (mail: Mail) => Promise<void>

export type SignInMethod = "email" | "google"

export const Allowlist = z.array(z.string().trim().toLowerCase().min(1)).readonly()
export type Allowlist = z.infer<typeof Allowlist>

export type AuthConfig = {
  readonly ipAddressHeader?: string
  readonly localIp?: string
  readonly database: BetterAuthOptions["database"]
  readonly site: { readonly url: string; readonly secret: string } | "loopback"
  readonly google: { readonly clientId: string; readonly clientSecret: string } | undefined
  readonly allowlist: Allowlist
  readonly send: Sender
}

export const allows = (allowlist: Allowlist, email: string): boolean => {
  const address = email.toLowerCase()
  return (
    allowlist.length === 0 ||
    allowlist.some((entry) => (entry.includes("@") ? address === entry : address.endsWith(`@${entry}`)))
  )
}

export const resend =
  (
    account: { readonly key: string; readonly from: string },
    post: typeof fetch = (input, init) => fetch(input, init),
  ): Sender =>
  async (mail) => {
    const response = await post("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${account.key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: account.from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(mail.html === undefined ? {} : { html: mail.html }),
      }),
    })
    if (!response.ok) throw new Error(`Resend refused the mail with ${String(response.status)}`)
  }

export const createAuth = (config: AuthConfig): Auth => {
  const instance = betterAuth({
    ...(config.site === "loopback"
      ? { baseURL: { allowedHosts: ["localhost:*", "127.0.0.1:*"], protocol: "http" } }
      : { baseURL: config.site.url, secret: config.site.secret }),
    database: config.database,
    advanced: {
      disableOriginCheck: false,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      ipAddress: { ipAddressHeaders: [config.ipAddressHeader ?? "x-forwarded-for"] },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/magic-link": { window: 60, max: 5 },
        "/email-otp/send-verification-otp": { window: 60, max: 5 },
        "/sign-in/email-otp": { window: 60, max: 10 },
        "/magic-link/verify": { window: 60, max: 10 },
        "/sign-in/social": { window: 60, max: 5 },
        "/get-session": false,
        "/sign-out": false,
        "/error": false,
        "/callback/google": false,
      },
    },
    socialProviders: config.google === undefined ? {} : { google: config.google },
    plugins: [
      emailOTP({
        expiresIn: linkMinutes * 60,
        otpLength: 6,
        allowedAttempts: 5,
        storeOTP: "hashed",
        resendStrategy: "rotate",
        rateLimit: { window: 60, max: 5 },
        sendVerificationOTP: async ({ email, otp }, context) => {
          const url = new URL("/api/auth/magic-link/verify", context?.context.baseURL)
          url.searchParams.set("token", otp)
          url.searchParams.set("email", email)
          const callback =
            context?.request === undefined ? null : new URL(context.request.url).searchParams.get("callbackURL")
          if (callback !== null) url.searchParams.set("callbackURL", callback)
          await config.send(signInMail(email, url.href, otp))
        },
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path !== "/email-otp/send-verification-otp" && context.path !== "/sign-in/email-otp") return
        const body = z.object({ email: z.email().transform((email) => email.toLowerCase()) }).safeParse(context.body)
        if (!body.success) throw new APIError("BAD_REQUEST", { message: "invalid email" })
        if (!allows(config.allowlist, body.data.email)) throw new APIError("FORBIDDEN", { message: "not invited" })
        if (context.path === "/email-otp/send-verification-otp") {
          if (context.body.type !== "sign-in") throw new APIError("BAD_REQUEST", { message: "sign-in only" })
          await context.context.internalAdapter.deleteVerificationByIdentifier(`sign-in-otp-${body.data.email}`)
        }
      }),
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => {
            if (config.allowlist.length === 0) return true
            const user = await context?.context.internalAdapter.findUserById(session.userId)
            return user != null && allows(config.allowlist, user.email)
          },
        },
      },
      user: {
        create: {
          before: async (user) => allows(config.allowlist, user.email),
        },
      },
    },
  })
  const methods: readonly SignInMethod[] = config.google === undefined ? ["email"] : ["email", "google"]
  const session = async (request: Request) => {
    const headers = new Headers(request.headers)
    headers.set("host", new URL(request.url).host)
    const found = await instance.api.getSession({ headers })
    return found === null || !allows(config.allowlist, found.user.email) ? null : found
  }
  return {
    user: async (request) => {
      const found = await session(request)
      return found === null ? undefined : UserId.parse(found.user.id)
    },
    handle: async (request) => {
      const url = new URL(request.url)
      const path = url.pathname.replace(/\/+$/, "")
      const routes = new Map([
        ["/api/auth/methods", ["GET"]],
        ["/api/auth/get-session", ["GET"]],
        ["/api/auth/sign-out", ["POST"]],
        ["/api/auth/error", ["GET"]],
        ["/api/auth/sign-in/magic-link", ["POST"]],
        ["/api/auth/email-otp/send-verification-otp", ["POST"]],
        ["/api/auth/sign-in/email-otp", ["POST"]],
        ["/api/auth/magic-link/verify", ["GET"]],
        ...(config.google === undefined
          ? []
          : ([
              ["/api/auth/sign-in/social", ["POST"]],
              ["/api/auth/callback/google", ["GET", "POST"]],
            ] satisfies [string, string[]][])),
      ])
      if (!routes.get(path)?.includes(request.method)) return Response.json({ error: "not found" }, { status: 404 })
      const limited =
        path.includes("/sign-in/") ||
        path === "/api/auth/email-otp/send-verification-otp" ||
        path === "/api/auth/magic-link/verify"
      if (limited) {
        const header = config.ipAddressHeader ?? "x-forwarded-for"
        const ip = request.headers.get(header) ?? config.localIp
        if (!z.union([z.ipv4(), z.ipv6()]).safeParse(ip).success)
          return Response.json(
            { message: "We couldn't verify this request. Reload the page and try again." },
            { status: 400 },
          )
        const headers = new Headers(request.headers)
        headers.set(header, ip ?? "")
        request = new Request(request, { headers })
      }
      if (path === "/api/auth/sign-in/magic-link" && request.method === "POST") {
        const body = z
          .object({ email: z.email(), callbackURL: z.string().optional() })
          .safeParse(await request.json().catch(() => null))
        if (!body.success) return Response.json({ error: "invalid request" }, { status: 400 })
        const callback = body.data.callbackURL ?? "/"
        if (!URL.canParse(callback, url) || new URL(callback, url).origin !== url.origin)
          return Response.json({ error: "invalid callback" }, { status: 403 })
        url.pathname = "/api/auth/email-otp/send-verification-otp"
        url.searchParams.set("callbackURL", new URL(callback, url).href)
        return instance.handler(
          new Request(url, {
            method: "POST",
            headers: request.headers,
            body: JSON.stringify({ email: body.data.email, type: "sign-in" }),
          }),
        )
      }
      if (path === "/api/auth/magic-link/verify" && request.method === "GET") {
        const destination = url.searchParams.get("callbackURL") ?? "/"
        if (!URL.canParse(destination, url)) return Response.json({ error: "invalid callback" }, { status: 403 })
        const callback = new URL(destination, url)
        if (callback.origin !== url.origin) return Response.json({ error: "invalid callback" }, { status: 403 })
        const verify = new URL("/api/auth/sign-in/email-otp", url)
        const headers = new Headers(request.headers)
        headers.set("content-type", "application/json")
        headers.set("origin", url.origin)
        const response = await instance.handler(
          new Request(verify, {
            method: "POST",
            headers,
            body: JSON.stringify({ email: url.searchParams.get("email"), otp: url.searchParams.get("token") }),
          }),
        )
        if (response.status === 429) {
          const headers = new Headers(response.headers)
          headers.set("content-type", "text/html; charset=utf-8")
          headers.set("cache-control", "no-store")
          headers.set("referrer-policy", "no-referrer")
          return new Response(
            '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Too many attempts</title><main><h1>Too many attempts</h1><p>Too many attempts. Wait a minute and try again.</p><a href="/">Return to sign in</a></main></html>',
            { status: 429, headers },
          )
        }
        const result = new Headers(response.headers)
        result.delete("content-type")
        if (!response.ok) callback.searchParams.set("error", "INVALID_TOKEN")
        result.set("location", callback.href)
        result.set("cache-control", "no-store")
        result.set("referrer-policy", "no-referrer")
        return new Response(null, { status: 302, headers: result })
      }
      if (path === "/api/auth/sign-in/email-otp" && request.method === "POST") {
        const body = z.object({ email: z.email(), otp: z.string().regex(/^\d{6}$/) }).safeParse(
          await request
            .clone()
            .json()
            .catch(() => null),
        )
        if (!body.success) return Response.json({ error: "invalid code" }, { status: 400 })
        const response = await instance.handler(request)
        if (response.status !== 400) return response
        const error = z
          .object({ code: z.string() })
          .passthrough()
          .safeParse(await response.clone().json())
        if (!error.success || error.data.code !== "INVALID_OTP") return response
        const context = await instance.$context
        const record = await context.internalAdapter.findVerificationValue(
          `sign-in-otp-${body.data.email.toLowerCase()}`,
        )
        const attemptsLeft = record === null ? 0 : Math.max(0, 5 - Number(record.value.split(":").at(-1)))
        return Response.json(
          {
            ...error.data,
            code: record === null ? "OTP_EXPIRED" : attemptsLeft === 0 ? "TOO_MANY_ATTEMPTS" : "INVALID_OTP",
            attemptsLeft,
          },
          { status: 400, headers: response.headers },
        )
      }
      if (path === "/api/auth/methods") return Response.json({ methods })
      if (path === "/api/auth/get-session" && (await session(request)) === null)
        return Response.json(null, { headers: { "cache-control": "no-store" } })
      return instance.handler(request)
    },
  }
}
