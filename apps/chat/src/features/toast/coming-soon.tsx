import { useEffect, useSyncExternalStore } from "react"

let message = ""
let shown = 0
const listeners = new Set<() => void>()

export const showComingSoon = (feature: string) => {
  message = `${feature} is coming soon`
  shown += 1
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function ComingSoonToast() {
  const text = useSyncExternalStore(subscribe, () => message)
  const count = useSyncExternalStore(subscribe, () => shown)
  useEffect(() => {
    if (text === "") return
    const timer = setTimeout(() => {
      message = ""
      for (const listener of listeners) listener()
    }, 2400)
    return () => clearTimeout(timer)
  }, [text, count])
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 top-[calc(3.75rem+var(--safe-area-top))] z-50 flex justify-center px-4"
    >
      {text === "" ? null : (
        <p className="rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">{text}</p>
      )}
    </div>
  )
}
