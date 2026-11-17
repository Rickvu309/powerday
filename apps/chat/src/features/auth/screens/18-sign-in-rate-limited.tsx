import { SignInPage } from "../sign-in"

export default function SignInRateLimited() {
  return <SignInPage google={false} initial={{ kind: "email", failure: "rate-limited" }} />
}
