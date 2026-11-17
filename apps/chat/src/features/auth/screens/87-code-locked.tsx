import { SignInPage } from "../sign-in"

export default function Screen() {
  return (
    <SignInPage
      google={false}
      initial={{ kind: "sent", email: "ada@example.com", resend: "ready", code: { kind: "locked" } }}
    />
  )
}
