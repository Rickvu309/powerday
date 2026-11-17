import { SignInPage } from "../sign-in"

export default function SignInNotInvited() {
  return <SignInPage google={false} initial={{ kind: "email", failure: "not-invited" }} />
}
