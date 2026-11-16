import { ModelId, ProviderId, type ListedModel } from "@powerday/chat-core"
import { createContext, useContext, useSyncExternalStore } from "react"
import * as z from "zod"

export type Models =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly models: readonly ListedModel[]; readonly chosen: ListedModel | undefined }

const ModelList = z.object({
  models: z.array(
    z.object({
      id: ModelId,
      provider: ProviderId,
      label: z.string(),
      capabilities: z.object({ tools: z.boolean(), vision: z.boolean(), reasoning: z.boolean() }),
      contextWindow: z.number(),
    }),
  ),
})

const rememberedKey = "power-chat:model"

const recall = () => {
  try {
    return localStorage.getItem(rememberedKey)
  } catch {
    return null
  }
}

const remember = (id: ModelId) => {
  try {
    localStorage.setItem(rememberedKey, id)
  } catch {}
}

export const fetchModels = async (): Promise<readonly ListedModel[]> => {
  const response = await fetch("/api/models")
  if (!response.ok) throw new Error(`GET /api/models answered ${response.status}`)
  return ModelList.parse(await response.json()).models
}

export const modelChoice = (load: () => Promise<readonly ListedModel[]>) => {
  let listed: readonly ListedModel[] | "loading" | "failed" = "loading"
  let preferred = recall()
  let snapshot: Models = { state: "loading" }
  let loading: Promise<void> | undefined
  const listeners = new Set<() => void>()

  const publish = () => {
    snapshot =
      typeof listed === "string"
        ? { state: listed }
        : { state: "ready", models: listed, chosen: listed.find((model) => model.id === preferred) ?? listed[0] }
    for (const listener of listeners) listener()
  }

  const reload = () => {
    if (loading !== undefined) return loading
    listed = "loading"
    publish()
    loading = load()
      .then(
        (models) => {
          listed = models
        },
        () => {
          listed = "failed"
        },
      )
      .finally(() => {
        loading = undefined
        publish()
      })
    return loading
  }

  return {
    reload,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (snapshot.state === "loading") void reload()
      return () => {
        listeners.delete(listener)
      }
    },
    read: () => snapshot,
    choose: (id: ModelId) => {
      preferred = id
      remember(id)
      publish()
    },
  }
}

export const ModelChoice = createContext(modelChoice(fetchModels))

export const useModels = () => {
  const choice = useContext(ModelChoice)
  return { models: useSyncExternalStore(choice.subscribe, choice.read), choose: choice.choose, reload: choice.reload }
}
