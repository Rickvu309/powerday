import { ConversationProblem } from "../conversation-problem"

const stay = () => undefined

export default function ChatLoadFailed() {
  return (
    <main className="flex h-dvh flex-col">
      <ConversationProblem error={new Error("Chat unavailable")} onRetry={stay} onSignIn={stay} onNewChat={stay} />
    </main>
  )
}
