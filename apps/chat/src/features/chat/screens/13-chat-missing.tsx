import { ConversationProblem } from "../conversation-problem"
import { ReplyProblem } from "../reply-problem"

const stay = () => undefined

export default function ChatMissing() {
  return (
    <main className="flex h-dvh flex-col">
      <ConversationProblem error={new ReplyProblem(404)} onRetry={stay} onSignIn={stay} onNewChat={stay} />
    </main>
  )
}
