import { SignInPage } from "../sign-in"

export default function SignInSent() {
  return <SignInPage google initial={{ kind: "sent", email: "ada.lovelace@example.com" }} />
}
