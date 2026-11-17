declare namespace Cloudflare {
  interface Env {
    ASSETS?: Fetcher
    ADMIN_EMAILS?: string
    PROVIDER_KEYS_SECRET?: string
    AI?: Ai
    DB: D1Database
    CATALOG: unknown
    USAGE_LIMITS: unknown
    AI_GATEWAY_ACCOUNT_ID?: string
    AI_GATEWAY_NAME?: string
    AI_GATEWAY_TOKEN?: string
  }
}
