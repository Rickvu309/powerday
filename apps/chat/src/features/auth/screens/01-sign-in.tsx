import { SignInPage } from "../sign-in"

export default function SignInWithGoogle() {
  return <SignInPage google initial={{ kind: "email", failure: undefined }} />
}
