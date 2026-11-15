import { SignInPage } from "../sign-in"

export default function SignInSending() {
  return <SignInPage google={false} initial={{ kind: "sending", method: "email" }} />
}
