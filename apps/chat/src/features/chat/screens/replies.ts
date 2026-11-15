import type { ChatMessage } from "@powerday/chat-core"
import { tokensOf } from "./scripted-transport"

export const question = "How do I debounce a search box in React so it doesn't fire a request on every keystroke?"

export const reasoning =
  "They want fewer requests while typing. A small hook that delays the value is the simplest answer. I should show the hook, how to use it, and compare it with the alternatives so they can choose."

export const reply = `Debouncing waits until the person stops typing for a moment, then sends **one** request with the final text. The cleanest way in React is a small hook that delays a value.

## A \`useDebounced\` hook

\`\`\`tsx
import { useEffect, useState } from "react"

export function useDebounced<Value>(value: Value, delayMs = 300) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return settled
}
\`\`\`

Use it by searching with the settled value instead of the raw one:

\`\`\`tsx
const [query, setQuery] = useState("")
const settled = useDebounced(query)
const results = useSearch(settled)
\`\`\`

## Which approach to pick

| Approach | Requests while typing | Feels instant | Extra code |
| --- | --- | --- | --- |
| No debounce | One per keystroke | Yes | None |
| \`useDebounced\` hook | One per pause | After 300 ms | 10 lines |
| \`useDeferredValue\` | One per keystroke | Yes | None |
| Library (\`lodash.debounce\`) | One per pause | After the delay | A dependency |

A few things worth knowing:

1. **Cancel stale requests.** Pass an \`AbortSignal\` to \`fetch\` so a slow early response can't overwrite a newer one.
2. **Pick the delay by feel.** 200 to 400 ms works for most search boxes.
3. **Keep the input controlled by the raw value**, so typing never lags behind the keyboard.

If you also want results to appear as fast as possible, combine the hook with a cache keyed by the query.`

export const longReply = (tokens: number) => {
  const sections: string[] = []
  for (let part = 1; tokensOf(sections.join("\n\n")).length < tokens; part += 1) {
    sections.push(reply.replace("## A `useDebounced` hook", `## Part ${part}: a \`useDebounced\` hook`))
  }
  return tokensOf(sections.join("\n\n")).slice(0, tokens).join("")
}

export const asked = (text: string, id = "asked"): ChatMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
})
