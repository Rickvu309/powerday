import { ModelId } from "@powerday/chat-core"
import { App } from "@/app"
import { LiveChats, liveChats } from "../live-chats"
import { asked, question } from "./replies"
import { scriptedTransport } from "./scripted-transport"

const chats = liveChats(
  scriptedTransport({ kind: "fail", status: 429, resetsAt: new Date("2099-11-17T00:00:00Z") }),
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
