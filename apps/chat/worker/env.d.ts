declare namespace Cloudflare {
  interface Env {
    DB: D1Database
    CATALOG: unknown
    AI_GATEWAY_ACCOUNT_ID?: string
    AI_GATEWAY_NAME?: string
    AI_GATEWAY_TOKEN?: string
  }
}
