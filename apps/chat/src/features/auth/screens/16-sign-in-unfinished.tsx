import { SignInPage } from "../sign-in"

export default function SignInFailure() {
  return <SignInPage google initial={{ kind: "email", failure: "unfinished" }} />
}
