import { App } from "@/app"
import { LiveChats, liveChats } from "../live-chats"
import { asked, question, reasoning, reply } from "./replies"
import { scriptedTransport } from "./scripted-transport"

const chats = liveChats(scriptedTransport({ kind: "reply", text: reply }), [
  asked(question),
  {
    id: "answer",
    role: "assistant",
    parts: [
      { type: "reasoning", text: reasoning, state: "done" },
      { type: "text", text: reply, state: "done" },
    ],
  },
])

export default function LongReply() {
  return (
    <LiveChats.Provider value={chats}>
      <App />
    </LiveChats.Provider>
  )
}
