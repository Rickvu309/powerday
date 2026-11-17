import { App } from "@/app"
import { LiveChats, liveChats } from "../live-chats"
import { asked } from "./replies"
import { scriptedTransport } from "./scripted-transport"

const chats = liveChats(scriptedTransport({ kind: "reply", text: "Finished reply." }), [
  asked("Still running"),
  {
    id: "answer",
    role: "assistant",
    parts: [{ type: "text", text: "Finished reply." }],
    metadata: { reply: { state: "streaming" } },
  },
])

export default function Screen() {
  return (
    <LiveChats.Provider value={chats}>
      <App />
    </LiveChats.Provider>
  )
}
