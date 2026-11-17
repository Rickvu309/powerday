import { App } from "@/app"
import { LiveChats, liveChats } from "../live-chats"
import { asked } from "./replies"
import { scriptedTransport } from "./scripted-transport"

const chats = liveChats(scriptedTransport({ kind: "reply", text: "Finished reply." }), [
  asked(
    "https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved\nbartholomew.fitzgerald@northwind-industries-holdings.example.com\nĐặng Thị Ngọc Hân\nنور الهدى عبد الرحمن\nPlease explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project. Please explain this project.",
  ),
  { id: "answer", role: "assistant", parts: [{ type: "text", text: "Finished reply." }] },
])

export default function Screen() {
  return (
    <LiveChats.Provider value={chats}>
      <App />
    </LiveChats.Provider>
  )
}
