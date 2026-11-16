import { SignInPage } from "../sign-in"

export default function InvitedEmailRequired() {
  return <SignInPage google={false} initial={{ kind: "email", failure: "not-invited" }} />
}
