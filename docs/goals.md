# Power Chat goals

Power Chat is a chat app at chat.powerday.work, as polished as Claude or ChatGPT. The platform owner chooses which LLM providers and models users get and keeps cost per user under control. Every goal ends with the check that proves it.

## 1. Overall

A signed-in user can chat with any model we enabled, their chats are saved, and their usage is limited.

## 2. Platform

1. Monorepo. `apps/landing`, `apps/chat`, `packages/*` on pnpm workspaces. Check: both apps build from the root.
2. Portable chat core. `packages/chat-core` uses Hono and the AI SDK and imports nothing from Cloudflare. Check: its tests pass on plain Node.
3. Cloudflare first. A Worker serves the chat API and app, D1 holds data, R2 holds files. Check: deploying chat leaves landing untouched.
4. Admin-managed providers. Admins manage providers, encrypted write-only keys, enabled models, daily limits and usage in the app. D1 stores the catalog, seeded by `CATALOG`; `USAGE_LIMITS` supplies initial limits and fallback. Workers AI uses the AI binding and external providers use AI Gateway with server-decrypted keys. OpenRouter and DeepSeek use native gateway routes; other compatible providers require a matching `custom-<provider id>` gateway provider whose upstream base URL matches the admin entry. Secrets: `ADMIN_EMAILS`, `PROVIDER_KEYS_SECRET`. Check: disabling a model needs no deploy, non-admins cannot administer the app, keys never appear in API responses, and atomic chat admission enforces email overrides.
5. Replies always saved. The server finishes and stores a reply even if the user leaves. Check: reopening the chat shows the full answer.
6. Sign-in. Better Auth with email magic links sent through Cloudflare Email Service. Sending to arbitrary recipients requires Workers Paid and an onboarded sending domain. Google is optional and hidden without its keys. Check: email sign-in works without third-party keys, and Google works when configured.
7. Escape hatch. Railway stays on standby. Check: the core runs on Node, so moving is a new entry point only.

## 3. Product

1. Chat. Check: the reply streams token by token.
2. Model picker. Check: switching models changes which provider answers.
3. Sign-in. Check: a signed-out visitor cannot send a message.
4. Saved chats. Check: a chat survives a reload and shows on another device.
5. Usage limits. Check: a user over the cap is blocked. `USAGE_LIMITS` in `apps/chat/wrangler.jsonc` sets `{ default: { period: "day" | "month", tokens }, overrides: { [userId]: { period, tokens } } }`. Windows follow UTC. Input plus output tokens count once, including cached input and reasoning already in those totals. At or above the cap, the server returns 429 with `resetsAt` and `Retry-After` before saving a question or calling a model. Replies admitted below the cap finish and count when they finish, even if they cross the cap; subsequent requests are blocked. Admission checks recorded usage atomically and allows one active reply per user. Concurrent requests receive 409 until that reply finishes and records usage. The final reply and its usage commit together, with three attempts before leaving the claim for recovery. Streams time out after two minutes. Claims expire after five minutes and reserve the remaining token allowance at admission. Before another admission, recovery charges each expired claim's reservation to its original period and marks the reply failed in one transaction. If recovery cannot write, admission fails closed. A late completion cannot replace a recovered reply. This is a token allowance, not a monetary budget. No prices are needed. A zero cap blocks all replies. Admin-managed D1 daily defaults and email overrides take precedence over config. Config supplies fallback allowances; the legacy `allowances` table is unused.
6. Tools (after v1). Check: the model searches the web and cites what it found.
7. Admin. Check: admins turn a model off without a deploy and view today’s and the last seven UTC days’ usage by user and model.

## 4. UI

1. shadcn on Base UI with shadcn AI Elements. Check: no screen uses a hardcoded color.
2. Claude and ChatGPT feel. Reference screens per flow live next to ours. Check: each screen has its reference beside it.
3. Design checks agents run. `pnpm check:ui` runs Playwright screenshot diffs, axe and contrast, overflow at 375px, light and dark. Check: an agent proves a UI change without a human.
4. Every state designed. Empty, loading, streaming, error, over-limit. Check: each state has an approved screenshot.

## 5. CI, CD and agents

1. One command. `pnpm check` runs typecheck, Biome, Vitest and UI checks. Check: same result locally and in CI.
2. Checks only what changed. Check: a landing change skips chat checks.
3. Preview per PR. Check: every PR has a working preview link.
4. Deploy on merge, only the changed app. Check: a chat merge leaves landing alone.
5. Merge rules. Squash only, green CI required. Check: GitHub enforces it.
6. Public-repo safety. Agents act only on allowlisted authors. Fork PRs get no secrets. No prices or prompts in the repo.
7. `AGENTS.md`. Check: a new agent ships a PR without asking how the repo works.

## 6. Product speed (CI enforces each budget)

1. First token. Our server adds under 150 ms.
2. App load. Under 200 KB gzip JS on first load, content under 1.5 s on mid-range mobile.
3. Typing. Input delay under 100 ms.
4. Streaming. 60 fps and no layout shift while text arrives.
5. Switching chats. Under 100 ms.
6. Sidebar search. Under 200 ms.

## 7. Build speed

1. Contracts first. Each wave starts with one PR that adds shared types, then agents build in parallel.
2. One owner per area per wave. Shared index files are generated. Dependency changes land first.
3. Small PRs. Under 400 changed lines excluding generated files, with preview link, screenshots and check results.
4. An agent that did not write the PR reviews it.
5. Merge by risk. Low-risk PRs merge within 30 minutes. High-risk paths (auth, billing, limits, migrations, CI and deploy config, secrets) go to the owner.
6. One merge at a time. At most 8 open PRs. `main` stays green.
7. Weekly report. PRs merged, time to merge, conflict rate, review load.
