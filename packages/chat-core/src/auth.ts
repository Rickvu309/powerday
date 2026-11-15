import { betterAuth, type BetterAuthOptions } from "better-auth"
import { APIError } from "better-auth/api"
import { magicLink } from "better-auth/plugins/magic-link"
import * as z from "zod"
import { UserId } from "./ids.js"

export type Auth = {
  readonly user: (request: Request) => Promise<UserId | undefined>
  readonly handle: (request: Request) => Promise<Response>
}

export type Mail = { readonly to: string; readonly subject: string; readonly text: string }

export type Sender = (mail: Mail) => Promise<void>

export type SignInMethod = "email" | "google"

export const Allowlist = z.array(z.string().trim().toLowerCase().min(1)).readonly()
export type Allowlist = z.infer<typeof Allowlist>

export type AuthConfig = {
  readonly database: BetterAuthOptions["database"]
  readonly site: { readonly url: string; readonly secret: string } | "loopback"
  readonly google: { readonly clientId: string; readonly clientSecret: string } | undefined
  readonly allowlist: Allowlist
  readonly send: Sender
}

export const linkMinutes = 10

export const allows = (allowlist: Allowlist, email: string): boolean => {
  const address = email.toLowerCase()
  return (
    allowlist.length === 0 ||
    allowlist.some((entry) => (entry.includes("@") ? address === entry : address.endsWith(`@${entry}`)))
  )
}

export const signInMail = (to: string, url: string): Mail => ({
  to,
  subject: "Sign in to Power Chat",
  text: [
    "Open this link to sign in to Power Chat:",
    "",
    url,
    "",
    `The link works once and expires in ${String(linkMinutes)} minutes.`,
    "If you did not ask to sign in, ignore this email.",
    "",
  ].join("\n"),
})

export const resend =
  (
    account: { readonly key: string; readonly from: string },
    post: typeof fetch = (input, init) => fetch(input, init),
  ): Sender =>
  async (mail) => {
    const response = await post("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${account.key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: account.from, to: [mail.to], subject: mail.subject, text: mail.text }),
    })
    if (!response.ok) throw new Error(`Resend refused the mail with ${String(response.status)}`)
  }

export const createAuth = (config: AuthConfig): Auth => {
  const instance = betterAuth({
    ...(config.site === "loopback"
      ? { baseURL: { allowedHosts: ["localhost:*", "127.0.0.1:*"], protocol: "http" } }
      : { baseURL: config.site.url, secret: config.site.secret }),
    database: config.database,
    advanced: { disableOriginCheck: false, defaultCookieAttributes: { httpOnly: true, sameSite: "lax" } },
    socialProviders: config.google === undefined ? {} : { google: config.google },
    plugins: [
      magicLink({
        expiresIn: linkMinutes * 60,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          if (!allows(config.allowlist, email)) throw new APIError("FORBIDDEN", { message: "not invited" })
          await config.send(signInMail(email, url))
        },
      }),
    ],
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
  return {
    user: async (request) => {
      const found = await instance.api.getSession({ headers: request.headers })
      return found === null || !allows(config.allowlist, found.user.email) ? undefined : UserId.parse(found.user.id)
    },
    handle: (request) =>
      new URL(request.url).pathname === "/api/auth/methods"
        ? Promise.resolve(Response.json({ methods }))
        : instance.handler(request),
  }
}
