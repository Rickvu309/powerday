import { readFileSync, writeFileSync } from "node:fs"
import { catalogConfig } from "../packages/chat-core/src/catalog.fixture.ts"

const folder = new URL("../apps/chat/dist/power_chat/", import.meta.url)
const config = JSON.parse(readFileSync(new URL("wrangler.json", folder), "utf8"))
delete config.ai
config.vars.CATALOG = catalogConfig
config.vars.ADMIN_EMAILS = JSON.stringify(["admin@example.com"])
config.vars.PROVIDER_KEYS_SECRET = "browser-test-secret-at-least-32-characters"
writeFileSync(new URL("browser.wrangler.json", folder), JSON.stringify(config))
