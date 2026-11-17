import { App } from "@/app"
import { LiveChats, liveChats } from "../live-chats"
import { asked } from "./replies"
import { scriptedTransport } from "./scripted-transport"

const chats = liveChats(scriptedTransport({ kind: "reply", text: "Finished reply." }), [
  asked("First line\nSecond line"),
  { id: "answer", role: "assistant", parts: [{ type: "text", text: "Finished reply." }] },
])

chats.open(null).draft.edit("First line\nSecond line")

export default function Screen() {
  return (
    <LiveChats.Provider value={chats}>
      <App />
    </LiveChats.Provider>
  )
}
