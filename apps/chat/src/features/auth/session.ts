import { useEffect, useState } from "react"

export type Failure = "not-invited" | "unsent" | "expired" | "unfinished"

export type Account =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | { readonly status: "signed-out"; readonly google: boolean; readonly failure: Failure | undefined }
  | { readonly status: "signed-in"; readonly email: string }

const redirectFailures: Readonly<Record<string, Failure>> = {
  INVALID_TOKEN: "expired",
  failed_to_create_user: "not-invited",
  unable_to_create_user: "not-invited",
}

const takeRedirectFailure = (): Failure | undefined => {
  const error = new URLSearchParams(location.search).get("error")
  if (error === null) return undefined
  const url = new URL(location.href)
  url.searchParams.delete("error")
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  return redirectFailures[error] ?? "unfinished"
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined

export const loadAccount = async (): Promise<Account> => {
  try {
    const read = async (path: string): Promise<unknown> => {
      const response = await fetch(path)
      if (!response.ok) throw new Error("auth unavailable")
      return response.json()
    }
    const [session, methods] = await Promise.all([read("/api/auth/get-session"), read("/api/auth/methods")])
    const email = field(field(session, "user"), "email")
    if (typeof email === "string") return { status: "signed-in", email }
    const offered = field(methods, "methods")
    if (session !== null || !Array.isArray(offered)) return { status: "unavailable" }
    return { status: "signed-out", google: offered.includes("google"), failure: takeRedirectFailure() }
  } catch {
    return { status: "unavailable" }
  }
}

let loaded: Promise<Account> | undefined

export function useAccount(): Account {
  const [account, setAccount] = useState<Account>({ status: "loading" })
  useEffect(() => {
    let current = true
    void (loaded ??= loadAccount()).then((found) => current && setAccount(found))
    return () => {
      current = false
    }
  }, [])
  return account
}

const post = (path: string, body: object) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })

export const sendLink = async (email: string): Promise<Failure | undefined> => {
  const response = await post("/api/auth/sign-in/magic-link", { email, callbackURL: "/" }).catch(() => undefined)
  if (response?.ok) return undefined
  return response?.status === 403 ? "not-invited" : "unsent"
}

export const continueWithGoogle = async (): Promise<Failure | undefined> => {
  try {
    const response = await post("/api/auth/sign-in/social", {
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/",
    })
    if (!response.ok) return "unfinished"
    const url = field(await response.json(), "url")
    if (typeof url !== "string") return "unfinished"
    location.assign(url)
    return undefined
  } catch {
    return "unfinished"
  }
}

export const signOut = async (): Promise<boolean> => {
  const response = await post("/api/auth/sign-out", {}).catch(() => undefined)
  return response?.ok === true
}
