import { MailCheckIcon } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import "./sign-in.css"
import { GoogleMark } from "./google-mark-art"
import { continueWithGoogle, sendLink, useAccount, type Failure } from "./session"

export type Step =
  | { readonly kind: "email"; readonly failure: Failure | undefined }
  | { readonly kind: "sending"; readonly method: "email" | "google" }
  | { readonly kind: "sent"; readonly email: string; readonly resend?: "ready" | "sending" | "sent" | Failure }

type SignInProps = { readonly google: boolean; readonly initial: Step }

const failures: Readonly<Record<Failure, string>> = {
  "not-invited": "Use an invited email address, or ask your administrator for access.",
  unsent: "We couldn't send the link. Check your connection and try again.",
  expired: "That sign-in link expired or was already used. Enter your email to get a new one.",
  unfinished: "Sign-in didn't finish. Try again.",
}

export function SignIn({ google, initial }: SignInProps) {
  const [step, setStep] = useState(initial)
  const [remaining, setRemaining] = useState(
    initial.kind === "sent" && (initial.resend === undefined || initial.resend === "sent") ? 30 : 0,
  )
  const [announcement, setAnnouncement] = useState("")
  const busy = useRef(initial.kind === "sending" || (initial.kind === "sent" && initial.resend === "sending"))
  const emailInput = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const pointer = useRef(false)
  const cooldowns = useRef(new Map<string, number>())
  const startCooldown = (email: string) => {
    cooldowns.current.set(email.trim().toLowerCase(), Date.now() + 30_000)
    setRemaining(30)
  }
  const waitFor = (email: string) =>
    Math.max(0, Math.ceil(((cooldowns.current.get(email.trim().toLowerCase()) ?? 0) - Date.now()) / 1000))
  const sent = step.kind === "sent"
  const refusal = step.kind === "email" && step.failure === "not-invited"

  useEffect(() => {
    if (refusal) {
      emailInput.current?.focus()
      emailInput.current?.select()
    }
  }, [refusal])

  useEffect(() => {
    if (!sent) return
    heading.current?.focus({ preventScroll: true })
  }, [sent])

  useEffect(() => {
    if (remaining === 0) return
    const deadline = Date.now() + remaining * 1000
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setRemaining(seconds)
      if (seconds === 0) setAnnouncement("Send a new link")
    }, 1000)
    return () => clearInterval(timer)
  }, [remaining])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy.current) return
    busy.current = true
    const email = String(new FormData(event.currentTarget).get("email")).trim()
    const wait = waitFor(email)
    if (wait > 0) {
      busy.current = false
      setRemaining(wait)
      setStep({ kind: "sent", email })
      return
    }
    setStep({ kind: "sending", method: "email" })
    const failed = await sendLink(email)
    busy.current = false
    if (failed === undefined) startCooldown(email)
    setStep(failed === undefined ? { kind: "sent", email } : { kind: "email", failure: failed })
  }

  const chooseGoogle = async () => {
    if (busy.current) return
    busy.current = true
    setStep({ kind: "sending", method: "google" })
    const failed = await continueWithGoogle()
    if (failed !== undefined) {
      busy.current = false
      setStep({ kind: "email", failure: failed })
    }
  }

  const resend = async () => {
    if (step.kind !== "sent" || busy.current || remaining > 0) return
    busy.current = true
    setStep({ ...step, resend: "sending" })
    setAnnouncement("")
    const failed = await sendLink(step.email)
    busy.current = false
    startCooldown(step.email)
    setStep({ ...step, resend: failed ?? "sent" })
    setAnnouncement(failed === undefined ? "New link sent" : failures[failed])
  }

  const failure = step.kind === "email" ? step.failure : undefined
  const pending = step.kind === "sending"
  const control = "h-auto min-h-10 whitespace-normal py-2 leading-[1.4] aria-disabled:opacity-50"

  return (
    <div
      data-auth-keyboard="true"
      onPointerDown={(event) => {
        pointer.current = true
        delete event.currentTarget.dataset.authKeyboard
      }}
      onKeyDown={(event) => {
        pointer.current = false
        event.currentTarget.dataset.authKeyboard = "true"
      }}
    >
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
      {step.kind === "sent" ? (
        <div
          data-pointer-success={pointer.current || undefined}
          className="auth-success flex min-w-0 flex-col items-center gap-3 text-center"
        >
          <MailCheckIcon aria-hidden className="size-6 text-muted-foreground" />
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-medium tracking-[-0.01em]">
            Check your email
          </h1>
          <p className="w-full text-sm leading-[1.5] text-pretty text-muted-foreground">
            Open the sign-in link we sent to
            <bdi className="mt-1 block font-medium [overflow-wrap:anywhere] text-foreground">{step.email}</bdi>
          </p>
          <p className="text-sm leading-[1.5] text-pretty text-muted-foreground">
            Check your spam folder. The link may take a minute to arrive.
          </p>
          <Button
            variant="outline"
            className={`${control} max-w-full tabular-nums`}
            aria-disabled={remaining > 0 || step.resend === "sending"}
            onClick={() => void resend()}
          >
            {step.resend === "sending" ? (
              <>
                <Spinner aria-hidden className="animate-none" />
                Sending a new link…
              </>
            ) : remaining > 0 ? (
              `Send a new link in ${remaining}s`
            ) : (
              "Send a new link"
            )}
          </Button>
          {step.resend !== undefined && step.resend !== "ready" && step.resend !== "sending" && (
            <p
              className={`text-sm leading-[1.5] ${step.resend === "sent" ? "text-muted-foreground" : "text-destructive"}`}
            >
              {step.resend === "sent" ? "New link sent" : failures[step.resend]}
            </p>
          )}
          <Button
            variant="ghost"
            className={control}
            aria-disabled={step.resend === "sending"}
            onClick={() => {
              if (busy.current) return
              setRemaining(0)
              setAnnouncement("")
              setStep({ kind: "email", failure: undefined })
            }}
          >
            Use a different email
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-medium text-balance">Sign in to Power Chat</h1>
            <p className="text-sm leading-[1.5] text-muted-foreground">
              {google ? "Continue with Google or get a sign-in link by email." : "We'll email you a link to sign in."}
            </p>
          </div>
          {google && (
            <>
              <Button variant="outline" className={control} aria-disabled={pending} onClick={() => void chooseGoogle()}>
                {pending && step.method === "google" ? (
                  <>
                    <Spinner aria-hidden className="animate-none" />
                    Connecting to Google…
                  </>
                ) : (
                  <>
                    <GoogleMark />
                    Continue with Google
                  </>
                )}
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
                readOnly={pending}
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
              <p id="sign-in-failure" role="alert" tabIndex={0} className="text-sm text-destructive">
                {failures[failure]}
              </p>
            )}
            <Button type="submit" className={control} aria-disabled={pending}>
              {pending && step.method === "email" ? (
                <>
                  <Spinner aria-hidden className="animate-none" />
                  Sending link…
                </>
              ) : (
                "Continue with email"
              )}
            </Button>
          </form>
        </div>
      )}
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
        <p role="alert" tabIndex={0} className="text-sm text-muted-foreground">
          Check your connection and try again.
        </p>
        <Button onClick={() => location.reload()}>Try again</Button>
      </div>
    </main>
  )
}
