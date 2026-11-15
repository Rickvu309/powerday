# powerday

Power Chat, the chat app at chat.powerday.work, and the landing page at powerday.work.

Read [AGENTS.md](AGENTS.md) for how the repo works and [docs/goals.md](docs/goals.md) for what we are building. `pnpm install && pnpm check` runs every check.

## Chat adapter contracts

`ConversationStore` keys conversations by `(owner, id)` and messages by `(owner, conversation id, message id)`.
`list`, `get`, `claim`, and `save` operate only within that owner. Two owners can use the same conversation and message ids.

`claim(conversation, message, reply)` atomically appends a new user message and its streaming assistant placeholder.
It returns the saved snapshot, or `undefined` if either message id already exists or any reply in that conversation is streaming.
It preserves earlier messages and the existing title and creation time. A D1 adapter must enforce this in one transaction,
including the duplicate check, rather than a separate lookup and write. The route also checks saved history before claiming.
`save` replaces the claimed snapshot after the reply finishes. Another turn cannot be claimed until that reply leaves `streaming`.
A repeated user message id returns 409, including after a failed reply. Retrying with a new id is a new turn.

`UsageLedger.record` is idempotent on `(user, conversation, message)`, where `message` is the assistant reply id.
A retry after a committed write must not add usage again. `UsageEvent.estimated` is true when either input or output
usage is unavailable from the provider. The fallback estimates one token per four Unicode code points, rounded up,
using the saved prompt text and the delivered reply text. Provider counts take precedence, including on failed streams.
The route tries the same event up to three times inside `waitUntil` before saving a billing failure and logging it.
A reply becomes `complete` only after `record` succeeds. This is an ordering guarantee, not a transaction across the two stores.

`POST /api/chat` accepts `{ id, model, message }`. The message has an id, role `user`, and nonempty text parts.
The reader rejects history arrays, assistant or system roles, metadata, and other part types. The server loads history for
the signed-in owner. Model providers and usage limits remain separate adapters.
