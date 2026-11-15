import { createHash } from "node:crypto"
import { availableParallelism } from "node:os"
import { defineConfig } from "@playwright/test"

const checkout = createHash("sha256").update(process.cwd()).digest().readUInt16BE(0)
const port = Number(process.env.POWERDAY_CHAT_PORT || 4400 + (checkout % 600))
const origin = `http://127.0.0.1:${port}`
const onCi = process.env.CI === "true" || process.env.CI === "1"
const built = process.env.POWERDAY_CHAT_BUILT === "1"

export default defineConfig({
  testDir: "tests/browser",
  retries: 0,
  workers: onCi ? undefined : Math.max(1, Math.min(4, Math.floor(availableParallelism() / 4))),
  reporter: "line",
  use: { baseURL: origin, browserName: "chromium" },
  webServer: {
    command: `${built ? "" : "pnpm --filter @powerday/chat build && "}pnpm --filter @powerday/chat exec wrangler d1 migrations apply power-chat --local && pnpm --filter @powerday/chat exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
