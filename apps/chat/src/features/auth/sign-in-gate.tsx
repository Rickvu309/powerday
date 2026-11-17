import { lazy, Suspense, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useAccount } from "./session"

const SignInPage = lazy(() => import("./sign-in").then((module) => ({ default: module.SignInPage })))

function AccountPending() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <Spinner className="motion-reduce:animate-none" aria-label="Loading your account" />
    </main>
  )
}

export function SignInGate({ children }: { readonly children: ReactNode }) {
  const account = useAccount()
  if (account.status === "loading") return <AccountPending />
  if (account.status === "unavailable") return <AccountUnavailable />
  if (account.status === "signed-out") {
    return (
      <Suspense fallback={<AccountPending />}>
        <SignInPage google={account.google} initial={{ kind: "email", failure: account.failure }} />
      </Suspense>
    )
  }
  return children
}

export function AccountUnavailable() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="flex max-w-sm flex-col gap-3 text-center">
        <h1 className="text-2xl font-medium">Couldn't load your account</h1>
        <p role="alert" tabIndex={0} className="text-sm text-muted-foreground">
          Check your connection and try again.
        </p>
        <Button onClick={() => location.reload()}>Try again</Button>
      </div>
    </main>
  )
}
