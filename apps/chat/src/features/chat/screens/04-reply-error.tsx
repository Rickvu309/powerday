import { App } from "@/app"
import { LiveChats, liveChats } from "../live-chats"
import { asked, question } from "./replies"
import { scriptedTransport } from "./scripted-transport"

const chats = liveChats(scriptedTransport({ kind: "fail", status: 500 }), [asked(question)])
void chats.open(null).regenerate()

export default function ReplyError() {
  return (
    <LiveChats.Provider value={chats}>
      <App />
    </LiveChats.Provider>
  )
}
