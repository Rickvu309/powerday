import { Button } from "@/components/ui/button"
import { openConversation } from "@/open-conversation"
import { tooLongMessage } from "./reply-problem"

export function TooLong() {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
      <p className="min-w-0 flex-1 text-pretty">{tooLongMessage}</p>
      <Button variant="outline" size="sm" onClick={() => openConversation(null)}>
        New chat
      </Button>
    </div>
  )
}
