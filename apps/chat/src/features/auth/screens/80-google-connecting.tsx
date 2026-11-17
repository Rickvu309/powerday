import { SignInPage } from "../sign-in"

export default function Screen() {
  return <SignInPage google initial={{ kind: "sending", method: "google" }} />
}
