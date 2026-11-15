import type { UsageLedger } from "@powerday/chat-core"

const notImplemented = (): never => {
  throw new Error("the usage ledger is not implemented")
}

export const usageLedger: (env: Cloudflare.Env) => UsageLedger = () => ({
  record: notImplemented,
  spent: notImplemented,
  allowance: notImplemented,
})
