import { App } from "@/app"
import { LiveChats, liveChats } from "../live-chats"
import { asked, question, reply } from "./replies"
import { scriptedTransport, tokensOf } from "./scripted-transport"

const chats = liveChats(scriptedTransport({ kind: "reply", text: reply }), [
  asked(question),
  {
    id: "answer",
    role: "assistant",
    metadata: {
      reply: { state: "stopped", usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0 } },
    },
    parts: [{ type: "text", text: tokensOf(reply).slice(0, 60).join(""), state: "done" }],
  },
])

export default function StoppedReply() {
  return (
    <LiveChats.Provider value={chats}>
      <App />
    </LiveChats.Provider>
  )
}
