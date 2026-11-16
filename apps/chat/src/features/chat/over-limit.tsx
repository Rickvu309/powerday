import { Clock3Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

export function useLimitReset(resetsAt: Date | undefined) {
  const [now, setNow] = useState(Date.now)
  const end = resetsAt?.getTime()
  useEffect(() => {
    if (end === undefined || end <= now) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(end - Date.now(), 2147483647)))
    return () => clearTimeout(timer)
  }, [end, now])
  return end !== undefined && end <= now
}

export function OverLimit({ resetsAt, onRetry }: { resetsAt: Date | undefined; onRetry: () => void }) {
  const reset = useLimitReset(resetsAt)
  return (
    <section role="alert" aria-label="Usage limit" className="rounded-2xl border bg-card p-5 text-sm shadow-sm">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <Clock3Icon aria-hidden="true" className="size-4 shrink-0" />
        <h2>{reset ? "Ready to chat again" : "Usage limit reached"}</h2>
      </div>
      <p className="mt-2 leading-6 text-muted-foreground">
        {reset
          ? "Your allowance has reset. Retry your message when you’re ready."
          : "You’ve used your allowance. Your chats are still here, and you can keep drafting."}
      </p>
      {resetsAt ? (
        <p className="mt-3 text-foreground">
          {reset ? "Reset " : "Resets "}
          <time dateTime={resetsAt.toISOString()}>
            {new Intl.DateTimeFormat(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            }).format(resetsAt)}
          </time>
        </p>
      ) : (
        <p className="mt-3 text-muted-foreground">Try again after your allowance resets.</p>
      )}
      <Button
        className="mt-4"
        variant="outline"
        size="sm"
        disabled={resetsAt !== undefined && !reset}
        onClick={onRetry}
      >
        Retry message
      </Button>
    </section>
  )
}
