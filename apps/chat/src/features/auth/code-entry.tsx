import { useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { verifyCode, type CodeState } from "./session"

export function CodeEntry({
  email,
  initial = { kind: "ready" },
  onBusy,
  unavailable,
}: {
  readonly email: string
  readonly initial?: CodeState
  readonly unavailable: boolean
  readonly onBusy: (busy: boolean) => void
}) {
  const [code, setCode] = useState("")
  const [state, setState] = useState(initial)
  const pending = useRef(false)
  const error =
    state.kind === "wrong"
      ? `That code isn't right. ${state.attemptsLeft} ${state.attemptsLeft === 1 ? "attempt" : "attempts"} left.`
      : state.kind === "expired"
        ? "That code expired or was already used. Send a new code."
        : state.kind === "locked"
          ? "Too many attempts. Send a new code to sign in."
          : state.kind === "failed"
            ? "Couldn't check the code. Check your connection and try again."
            : undefined
  const verify = async (digits: string) => {
    if (unavailable || pending.current || digits.length !== 6 || state.kind === "locked" || state.kind === "expired")
      return
    pending.current = true
    onBusy(true)
    setState({ kind: "verifying" })
    const result = await verifyCode(email, digits)
    if (result === undefined) {
      location.reload()
      return
    }
    setState(result)
    setCode("")
    pending.current = false
    onBusy(false)
  }
  return (
    <form
      className="flex w-full flex-col gap-2 text-left"
      onSubmit={(event) => {
        event.preventDefault()
        void verify(code)
      }}
    >
      <label htmlFor="sign-in-code" className="text-sm font-medium">
        Sign-in code
      </label>
      <Input
        id="sign-in-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        className="h-12 text-center font-mono text-xl tracking-[0.3em]"
        value={code}
        readOnly={unavailable || state.kind === "verifying" || state.kind === "locked" || state.kind === "expired"}
        aria-invalid={error !== undefined}
        aria-describedby="sign-in-code-status"
        onChange={(event) => {
          const digits = event.target.value.replace(/\s/g, "")
          if (!/^\d{0,6}$/.test(digits)) return
          setCode(digits)
          if (digits.length === 6) void verify(digits)
        }}
      />
      <p
        id="sign-in-code-status"
        role="status"
        className={`text-sm leading-[1.5] ${error === undefined ? "text-muted-foreground" : "text-destructive"}`}
      >
        {error ??
          (state.kind === "verifying" ? "Checking your code…" : "Enter the 6-digit code. It expires in 10 minutes.")}
      </p>
    </form>
  )
}
