import { SignInPage } from "../sign-in"

export default function Screen() {
  return <SignInPage google initial={{ kind: "sent", email: "ada@example.com", resend: "sent" }} />
}
