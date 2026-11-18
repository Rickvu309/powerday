import { useSyncExternalStore } from "react"
import type { OfficeKind } from "./office-registry"

let kind: OfficeKind | null = null
const listeners = new Set<() => void>()

const subscribeOfficeKind = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const readOfficeKind = () => kind

export const useOfficeKind = () => useSyncExternalStore(subscribeOfficeKind, readOfficeKind, () => null)

export const setOfficeKind = (next: OfficeKind | null) => {
  if (kind === next) return
  kind = next
  for (const listener of listeners) listener()
}
