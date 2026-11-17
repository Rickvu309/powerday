import * as z from "zod"

const key = "power-chat-kept-draft"

const KeptDraft = z.object({ owner: z.string(), draft: z.string() })

const keep = (owner: string, draft: string) => {
  try {
    localStorage.setItem(key, JSON.stringify({ owner, draft }))
    return true
  } catch {
    return false
  }
}

export const signInKeepingDraft = (owner: string | undefined, draft: string, path: string) => {
  if (owner !== undefined && draft.trim() !== "" && !keep(owner, draft)) return false
  location.assign(path)
  return true
}

export const readKeptDraft = (owner: string) => {
  try {
    const kept = localStorage.getItem(key)
    const parsed = KeptDraft.safeParse(JSON.parse(kept ?? "null"))
    if (!parsed.success || parsed.data.owner !== owner) return ""
    return parsed.data.draft
  } catch {
    return ""
  }
}

export const clearKeptDraft = (owner: string, draft: string) => {
  try {
    if (readKeptDraft(owner) === draft) localStorage.removeItem(key)
  } catch {
    return
  }
}
