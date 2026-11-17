import { AdminMutation, AdminOverview, type AdminOverview as Overview } from "@powerday/chat-core"
import { useEffect, useState, useContext, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ModelChoice } from "@/features/model-picker/model-choice"
import { ProviderForm } from "./provider-form"
import { ModelForm } from "./model-form"
import { leaveAdmin, returnPath } from "./admin-navigation"
import { Limits } from "./limits"
import { Usage } from "./usage"

export type Save = (input: unknown) => Promise<boolean>
export type Phase = "loading" | "ready" | "saving" | "saved" | "key-saved" | "error"
type Editor =
  | { kind: "provider"; value: Overview["providers"][number] | undefined }
  | { kind: "model"; value: Overview["models"][number] | undefined }
type Target =
  | { kind: "provider" | "model"; id: string; label: string }
  | { kind: "disable"; id: string; label: string; mutation: Extract<AdminMutation, { action: "model" }> }

const load = async () => {
  const response = await fetch("/api/admin/overview", { cache: "no-store" })
  if (!response.ok) throw new Error("Could not load admin. Check your connection and try again.")
  return AdminOverview.parse(await response.json())
}

export function Admin({
  initialData,
  initialPhase = "loading",
  demo = false,
  confirm = false,
  editing,
  disable = false,
}: {
  initialData?: Overview
  initialPhase?: Phase
  demo?: boolean
  editing?: "provider" | "model"
  confirm?: boolean
  disable?: boolean
}) {
  const models = useContext(ModelChoice)
  const [data, setData] = useState(initialData)
  const [phase, setPhase] = useState<Phase>(initialPhase)
  const [error, setError] = useState(
    confirm || disable
      ? "Could not save. Check the fields and your connection, then try again."
      : "Could not load admin. Check your connection and try again.",
  )
  const [editor, setEditor] = useState<Editor | undefined>(
    editing === undefined
      ? undefined
      : editing === "provider"
        ? { kind: "provider", value: initialData?.providers[0] }
        : { kind: "model", value: initialData?.models[0] },
  )
  const initialModel = initialData?.models[0]
  const [target, setTarget] = useState<Target | undefined>(
    disable && initialModel
      ? {
          kind: "disable",
          id: initialModel.id,
          label: initialModel.label,
          mutation: { action: "model", model: { ...initialModel, status: "disabled" } },
        }
      : confirm
        ? { kind: "provider", id: "openai", label: "OpenAI" }
        : undefined,
  )
  const dialogError = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (target && phase === "error") dialogError.current?.focus()
  }, [target, phase])
  const dialogFocus = useRef("admin-title")
  useEffect(() => {
    if (target)
      dialogFocus.current = target.kind === "disable" ? `edit-model-${target.id}` : `edit-${target.kind}-${target.id}`
  }, [target])
  const focusAfterForm = useRef<string | undefined>(undefined)
  const closeEditor = (kind: "provider" | "model", id?: string) => {
    focusAfterForm.current = id === undefined ? `add-${kind}` : `edit-${kind}-${id}`
    setEditor(undefined)
  }
  useEffect(() => {
    if (editor === undefined && phase !== "saving" && focusAfterForm.current) {
      const element = document.getElementById(focusAfterForm.current) ?? document.getElementById("admin-title")
      element?.focus()
      focusAfterForm.current = undefined
    }
  }, [editor, phase, data])
  const refresh = async () => {
    try {
      setData(await load())
      setPhase("ready")
    } catch {
      setPhase("error")
    }
  }
  useEffect(() => {
    document.title = "Admin · Power Chat"
    if (!document.querySelector('[data-mobile="true"]')) document.getElementById("admin-title")?.focus()
    if (!demo) void refresh()
  }, [demo])
  const save = async (input: unknown, confirmed = false): Promise<boolean> => {
    const parsed = AdminMutation.safeParse(input)
    if (!parsed.success) {
      setError(
        "Check the fields. Use lowercase letters, numbers, dots or hyphens for ids, an HTTPS base URL for compatible providers, and a key of at least 8 characters.",
      )
      setPhase("error")
      return false
    }
    const mutation = parsed.data
    if (
      !confirmed &&
      mutation.action === "model" &&
      mutation.model.status === "disabled" &&
      data?.models.some((model) => model.id === mutation.model.id && model.status === "enabled")
    ) {
      setTarget({ kind: "disable", id: mutation.model.id, label: mutation.model.label, mutation: mutation })
      return false
    }
    setPhase("saving")
    try {
      if (demo) {
        setPhase("saved")
        return true
      }
      const response = await fetch("/api/admin/mutate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mutation),
      })
      if (!response.ok) throw new Error("Could not save. Check the fields and your connection, then try again.")
      if (mutation.action !== "limit") void models.reload()
      try {
        setData(await load())
        setPhase(mutation.action === "provider" && mutation.key !== undefined ? "key-saved" : "saved")
      } catch {
        setError("Saved, but the list could not refresh. Try again to load the latest settings.")
        setPhase("error")
      }
      return true
    } catch {
      setError("Could not save. Check the fields and your connection, then try again.")
      setPhase("error")
      return false
    }
  }
  const confirmTarget = async () => {
    if (!target) return
    const saved = await save(
      target.kind === "disable"
        ? target.mutation
        : { action: target.kind === "provider" ? "remove-provider" : "remove-model", id: target.id },
      true,
    )
    if (!saved) return
    if (target.kind === "disable" && editor?.kind === "model") closeEditor("model", target.id)
    setTarget(undefined)
  }
  return (
    <div id="admin-content" className="mx-auto grid min-w-0 w-full max-w-5xl gap-8 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 id="admin-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight">
            Admin
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage the models people can use and their daily allowance.
          </p>
        </div>
        <a
          className="rounded-md px-3 py-2 text-sm underline underline-offset-4 focus-visible:outline"
          href={returnPath()}
          onClick={leaveAdmin}
        >
          Back to chat
        </a>
      </header>
      <div role="status" className="text-sm" aria-live="polite">
        {phase === "loading"
          ? "Loading admin…"
          : phase === "saving"
            ? "Saving changes…"
            : phase === "key-saved"
              ? "Key saved. The input is cleared."
              : phase === "saved"
                ? "Changes saved."
                : ""}
      </div>
      {phase === "error" && target === undefined && (
        <div role="alert" className="flex flex-wrap items-center gap-4 rounded-lg border p-4 text-sm">
          <p>{error}</p>
          <Button variant="outline" onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      )}
      {data && phase !== "loading" && (
        <fieldset disabled={phase === "saving"} className="grid min-w-0 gap-10" aria-busy={phase === "saving"}>
          <section className="grid min-w-0 gap-5" aria-labelledby="providers-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="providers-title" className="text-xl font-semibold">
                  Providers
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keys stay on the server. Only the last four characters are shown.
                </p>
              </div>
              <Button
                id="add-provider"
                variant="outline"
                onClick={() => setEditor({ kind: "provider", value: undefined })}
              >
                Add provider
              </Button>
            </div>
            {data.providers.length === 0 && (
              <p className="rounded-xl border p-5 text-sm text-muted-foreground">
                No providers yet. Add a provider, then add its models.
              </p>
            )}
            <ul className="grid min-w-0 gap-3">
              {data.providers.map((provider) => {
                const key = data.keys.find((k) => k.provider === provider.id)
                return (
                  <li
                    key={provider.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                  >
                    <div className="min-w-0 break-all">
                      <h3 className="font-medium">{provider.label}</h3>
                      <p className="text-sm text-muted-foreground">
                        {provider.kind} ·{" "}
                        {key?.suffix ?? (provider.kind === "workers-ai" ? "Uses AI binding" : "No saved key")}
                      </p>
                      {key && (
                        <p className="text-xs text-muted-foreground">
                          Updated{" "}
                          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                            key.updatedAt,
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {provider.kind !== "workers-ai" && provider.kind !== "mock" && (
                        <Button
                          variant="outline"
                          id={`edit-provider-${provider.id}`}
                          aria-label={`Edit ${provider.label} provider`}
                          onClick={() => setEditor({ kind: "provider", value: provider })}
                        >
                          Edit
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        aria-label={`Delete ${provider.label} provider`}
                        onClick={() => setTarget({ kind: "provider", id: provider.id, label: provider.label })}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
            {editor?.kind === "provider" && (
              <ProviderForm
                key={editor.value?.id ?? "new-provider"}
                provider={editor.value}
                save={async (input) => {
                  const result = await save(input)
                  const parsed = AdminMutation.safeParse(input)
                  if (result && parsed.success && parsed.data.action === "provider")
                    closeEditor("provider", parsed.data.provider.id)
                  return result
                }}
                cancel={() => closeEditor("provider", editor.value?.id)}
              />
            )}
          </section>
          <section className="grid min-w-0 gap-5" aria-labelledby="models-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="models-title" className="text-xl font-semibold">
                  Models
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Disabled models disappear from the picker immediately.
                </p>
              </div>
              <Button
                variant="outline"
                id="add-model"
                disabled={data.providers.length === 0}
                onClick={() => setEditor({ kind: "model", value: undefined })}
              >
                Add model
              </Button>
            </div>
            {data.models.length === 0 && (
              <p className="rounded-xl border p-5 text-sm text-muted-foreground">
                No models yet. Add a model to make it available in chat.
              </p>
            )}
            <ul className="grid min-w-0 gap-3">
              {data.models.map((model) => (
                <li key={model.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                  <div className="min-w-0 break-all">
                    <h3 className="font-medium">{model.label}</h3>
                    <p className="text-sm text-muted-foreground">
                      {model.provider} · {model.status === "enabled" ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      aria-label={`${model.status === "enabled" ? "Disable" : "Enable"} ${model.label}`}
                      onClick={() =>
                        void save({
                          action: "model",
                          model: { ...model, status: model.status === "enabled" ? "disabled" : "enabled" },
                        })
                      }
                    >
                      {model.status === "enabled" ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="outline"
                      id={`edit-model-${model.id}`}
                      aria-label={`Edit ${model.label} model`}
                      onClick={() => setEditor({ kind: "model", value: model })}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      aria-label={`Delete ${model.label} model`}
                      onClick={() => setTarget({ kind: "model", id: model.id, label: model.label })}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {editor?.kind === "model" && (
              <ModelForm
                key={editor.value?.id ?? "new-model"}
                model={editor.value}
                providers={data.providers}
                save={async (input) => {
                  const result = await save(input)
                  const parsed = AdminMutation.safeParse(input)
                  if (result && parsed.success && parsed.data.action === "model")
                    closeEditor("model", parsed.data.model.id)
                  return result
                }}
                cancel={() => closeEditor("model", editor.value?.id)}
              />
            )}
          </section>
          <Limits
            key={JSON.stringify(data.limits)}
            limits={data.limits}
            save={save}
            focusAfter={(id) => {
              focusAfterForm.current = id
            }}
          />
          <Usage usage={data.usage} users={data.users} />
        </fieldset>
      )}
      <Dialog
        open={target !== undefined}
        onOpenChange={(open) => {
          if (!open && phase !== "saving") setTarget(undefined)
        }}
      >
        <DialogContent
          className="min-w-0 [overflow-wrap:anywhere]"
          finalFocus={() => document.getElementById(dialogFocus.current) ?? document.getElementById("admin-title")}
        >
          <DialogHeader>
            <DialogTitle>
              {target?.kind === "disable" ? "Disable" : "Delete"} {target?.label}?
            </DialogTitle>
            <DialogDescription>
              {target?.kind === "disable"
                ? `People won't be able to pick ${target.label} for new messages. Existing chats keep their history.`
                : target?.kind === "provider"
                  ? "This removes the provider, its saved key and all its models. People will no longer be able to use them. This cannot be undone."
                  : "This removes the model from chat. Saved conversations stay available. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          {phase === "error" && (
            <div role="alert" tabIndex={-1} ref={dialogError}>
              <p>{error}</p>
              <Button variant="outline" onClick={() => void confirmTarget()}>
                Try again
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={phase === "saving"} onClick={() => setTarget(undefined)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={phase === "saving"} onClick={() => void confirmTarget()}>
              {target?.kind === "disable" ? "Disable model" : `Delete ${target?.kind}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
