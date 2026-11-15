import { App } from "@/app"
import { LiveChats, liveChats } from "../live-chats"
import { asked, longReply, question, reply } from "./replies"
import { scriptedTransport } from "./scripted-transport"

const tokens = Number(new URLSearchParams(window.location.search).get("tokens") ?? 0)
const chats = liveChats(
  scriptedTransport(
    tokens > 0 ? { kind: "reply", text: longReply(tokens) } : { kind: "reply", text: reply, holdAfter: 88 },
  ),
  [asked(question)],
)
void chats.open(null).chat.regenerate()

export default function StreamingReply() {
  return (
    <LiveChats.Provider value={chats}>
      <App />
    </LiveChats.Provider>
  )
}
