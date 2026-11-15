import { SignInPage } from "../sign-in"

export default function SignInError() {
  return <SignInPage google initial={{ kind: "email", failure: "expired" }} />
}
