import { useSyncExternalStore } from "react"

export type PeekPanel = "chat" | "office"

export const peekOpenDelay = 80
export const peekCloseDelay = 160

let peeked: PeekPanel | null = null
let pending: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

const cancel = () => {
  clearTimeout(pending)
  pending = undefined
}

const show = (next: PeekPanel | null) => {
  cancel()
  if (peeked === next) return
  peeked = next
  listeners.forEach((notify) => notify())
}

const later = (next: PeekPanel | null, wait: number) => {
  cancel()
  pending = setTimeout(() => show(next), wait)
}

export const readPeek = () => peeked

export const subscribePeek = (notify: () => void) => {
  listeners.add(notify)
  return () => {
    listeners.delete(notify)
  }
}

export const peek = (panel: PeekPanel) => (peeked === null ? later(panel, peekOpenDelay) : show(panel))
export const holdPeek = cancel
export const leavePeek = () => (peeked === null ? cancel() : later(null, peekCloseDelay))
export const endPeek = () => show(null)

export const usePeek = () => useSyncExternalStore(subscribePeek, readPeek, () => null)
