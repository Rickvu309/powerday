import { ModelId } from "@powerday/chat-core"
import { App } from "@/app"
import { LiveChats, liveChats } from "../live-chats"
import { asked, question } from "./replies"
import { scriptedTransport } from "./scripted-transport"

const chats = liveChats(scriptedTransport({ kind: "fail", status: 401 }), [asked(question)], ModelId.parse("mock-fast"))

export default function ReplyError() {
  return (
    <LiveChats.Provider value={chats}>
      <App />
    </LiveChats.Provider>
  )
}
