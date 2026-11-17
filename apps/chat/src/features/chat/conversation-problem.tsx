import { LogInIcon, RotateCcwIcon, SquarePenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ReplyProblem, sessionExpired } from "./reply-problem"

export function ConversationProblem({
  error,
  onRetry,
  onSignIn,
  onNewChat,
}: {
  error: unknown
  onRetry: () => void
  onSignIn: () => void
  onNewChat: () => void
}) {
  const missing = error instanceof ReplyProblem && error.status === 404
  const expired = sessionExpired(error)
  return (
    <div
      role="alert"
      tabIndex={0}
      className="m-auto flex max-w-sm flex-col items-center gap-4 p-4 text-center text-sm text-pretty"
    >
      <p>
        {missing
          ? "This chat doesn’t exist or was deleted."
          : expired
            ? "Your session expired. Sign in to open this chat."
            : "Couldn’t open this chat. Check your connection and try again."}
      </p>
      {missing ? (
        <Button variant="outline" onClick={onNewChat}>
          <SquarePenIcon />
          New chat
        </Button>
      ) : expired ? (
        <Button onClick={onSignIn}>
          <LogInIcon />
          Sign in
        </Button>
      ) : (
        <Button variant="outline" onClick={onRetry}>
          <RotateCcwIcon />
          Retry
        </Button>
      )}
    </div>
  )
}
