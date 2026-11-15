import { SignInPage } from "../sign-in"

export default function SignInEmailOnly() {
  return <SignInPage google={false} initial={{ kind: "email", failure: undefined }} />
}
