import { ArrowUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function Chat() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center px-4">
        <h1 className="text-center text-3xl font-medium text-balance">How can I help you today?</h1>
      </div>
      <form className="mx-auto w-full max-w-3xl px-4 pb-4" onSubmit={(event) => event.preventDefault()}>
        <div className="rounded-2xl border bg-card p-3 shadow-sm">
          <Textarea
            aria-label="Message"
            className="min-h-12 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
            placeholder="Message Power Chat"
          />
          <div className="flex justify-end">
            <Button aria-label="Send" size="icon" type="submit" disabled>
              <ArrowUpIcon />
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
