import { Clock3Icon, RotateCcwIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

export function useLimitReset(resetsAt: Date | undefined) {
  const [now, setNow] = useState(Date.now)
  const end = resetsAt?.getTime()
  useEffect(() => {
    if (end === undefined || end <= now) return
    const timer = setTimeout(() => setNow(Date.now()), Math.min(end - Date.now(), 2 ** 31 - 1))
    return () => clearTimeout(timer)
  }, [end, now])
  return end !== undefined && end <= now
}

const day = 86_400_000

const resumes = (at: Date) => {
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(at)
  if (at.getTime() - Date.now() < day) return `at ${time}`
  return `on ${new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(at)} at ${time}`
}

export function OverLimit({ resetsAt, onRetry }: { resetsAt: Date | undefined; onRetry: () => void }) {
  const reset = useLimitReset(resetsAt)
  const until = reset ? undefined : resetsAt
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-card px-4 py-3 text-sm"
    >
      <Clock3Icon className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 font-medium">
        {reset ? "Your usage limit has reset" : "You’ve reached your usage limit"}
      </p>
      {until ? (
        <p className="basis-full pl-7 text-pretty text-muted-foreground">
          You can send messages again{" "}
          <time dateTime={until.toISOString()} className="whitespace-nowrap">
            {resumes(until)}
          </time>
          . Until then, you can read your chats and write your next message.
        </p>
      ) : (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcwIcon />
          Retry
        </Button>
      )}
    </div>
  )
}
