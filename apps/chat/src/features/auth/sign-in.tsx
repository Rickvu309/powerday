import { MailCheckIcon } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { GoogleMark } from "./google-mark-art"
import { continueWithGoogle, sendLink, useAccount, type Failure } from "./session"

export type Step =
  | { readonly kind: "email"; readonly failure: Failure | undefined }
  | { readonly kind: "sending"; readonly method: "email" | "google" }
  | { readonly kind: "sent"; readonly email: string }

type SignInProps = { readonly google: boolean; readonly initial: Step }

const failures: Readonly<Record<Failure, string>> = {
  "not-invited": "Use an invited email address, or ask your administrator for access.",
  unsent: "We couldn't send the link. Check your connection and try again.",
  expired: "That sign-in link expired or was already used. Enter your email to get a new one.",
  unfinished: "Sign-in didn't finish. Try again.",
}

export function SignIn({ google, initial }: SignInProps) {
  const [step, setStep] = useState(initial)

  const emailInput = useRef<HTMLInputElement>(null)
  const refusal = step.kind === "email" && step.failure === "not-invited"
  useEffect(() => {
    if (refusal) {
      emailInput.current?.focus()
      emailInput.current?.select()
    }
  }, [refusal])

  if (step.kind === "sent") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <MailCheckIcon aria-hidden className="size-6 text-muted-foreground" />
        <h1 className="text-2xl font-medium">Check your email</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Open the sign-in link we sent to
          <span className="mt-1 block font-medium break-words text-foreground">{step.email}</span>
        </p>
        <Button variant="ghost" onClick={() => setStep({ kind: "email", failure: undefined })}>
          Use a different email
        </Button>
      </div>
    )
  }

  const failure = step.kind === "email" ? step.failure : undefined

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get("email")).trim()
    setStep({ kind: "sending", method: "email" })
    const failed = await sendLink(email)
    setStep(failed === undefined ? { kind: "sent", email } : { kind: "email", failure: failed })
  }

  const chooseGoogle = async () => {
    setStep({ kind: "sending", method: "google" })
    const failed = await continueWithGoogle()
    if (failed !== undefined) setStep({ kind: "email", failure: failed })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-medium text-balance">Sign in to Power Chat</h1>
        <p className="text-sm text-muted-foreground">
          {google ? "Continue with Google or get a sign-in link by email." : "We'll email you a link to sign in."}
        </p>
      </div>
      {google && (
        <>
          <Button
            variant="outline"
            className="h-10"
            disabled={step.kind === "sending"}
            onClick={() => void chooseGoogle()}
          >
            <GoogleMark />
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" />
            or
            <Separator className="flex-1" />
          </div>
        </>
      )}
      <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email
          <Input
            ref={emailInput}
            className="h-10 text-base md:text-sm"
            type="email"
            name="email"
            disabled={step.kind === "sending"}
            autoCapitalize="none"
            spellCheck={false}
            required
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={failure === "not-invited"}
            aria-describedby={failure === undefined ? undefined : "sign-in-failure"}
          />
        </label>
        {failure !== undefined && (
          <p id="sign-in-failure" role="alert" className="text-sm text-destructive">
            {failures[failure]}
          </p>
        )}
        <Button type="submit" className="h-10" disabled={step.kind === "sending"}>
          {step.kind === "sending" ? (
            <>
              <Spinner className="motion-reduce:animate-none" aria-label="Sending" />
              {step.method === "email" ? "Sending link" : "Connecting"}
            </>
          ) : (
            "Continue with email"
          )}
        </Button>
      </form>
    </div>
  )
}

export function SignInPage(props: SignInProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <SignIn {...props} />
      </div>
    </main>
  )
}

export function SignInGate({ children }: { readonly children: ReactNode }) {
  const account = useAccount()
  if (account.status === "loading")
    return (
      <main className="grid min-h-dvh place-items-center">
        <Spinner className="motion-reduce:animate-none" aria-label="Loading your account" />
      </main>
    )
  if (account.status === "unavailable") return <AccountUnavailable />
  if (account.status === "signed-out") {
    return <SignInPage google={account.google} initial={{ kind: "email", failure: account.failure }} />
  }
  return children
}

export function AccountUnavailable() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="flex max-w-sm flex-col gap-3 text-center">
        <h1 className="text-2xl font-medium">Couldn't load your account</h1>
        <p role="alert" className="text-sm text-muted-foreground">
          Check your connection and try again.
        </p>
        <Button onClick={() => location.reload()}>Try again</Button>
      </div>
    </main>
  )
}
