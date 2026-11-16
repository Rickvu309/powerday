import { ModelId } from "@powerday/chat-core"
import { App } from "@/app"
import { LiveChats, liveChats } from "../live-chats"
import { asked, question } from "./replies"
import { scriptedTransport } from "./scripted-transport"

const midnight = new Date()
midnight.setUTCHours(24, 0, 0, 0)

const chats = liveChats(
  scriptedTransport({ kind: "fail", status: 429, resetsAt: midnight }),
  [asked(question)],
  ModelId.parse("mock-fast"),
)

export default function OverLimitScreen() {
  return (
    <LiveChats.Provider value={chats}>
      <App />
    </LiveChats.Provider>
  )
}
