import { Composer } from "../composer"
import { liveChats } from "../live-chats"
import { ThreadLoading } from "../thread-loading"

const conversation = liveChats().open(null)
export default function ColdThreadLoading() {
  return (
    <div className="flex h-dvh flex-col">
      <ThreadLoading question="Keep my question visible while the reply loads." />
      <Composer draft={conversation.draft} busy={true} ready={false} onSend={() => false} onStop={() => {}} />
    </div>
  )
}
