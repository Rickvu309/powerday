import type { Auth } from "@powerday/chat-core"

const notImplemented = (): never => {
  throw new Error("sign-in is not implemented")
}

export const auth: (env: Cloudflare.Env) => Auth = () => ({
  user: async () => undefined,
  handle: notImplemented,
})
