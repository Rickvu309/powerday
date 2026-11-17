import type { AdminOverview } from "@powerday/chat-core"
import { Button } from "@/components/ui/button"
import { Field } from "./field"
import type { Save } from "./admin"

type Provider = AdminOverview["providers"][number]
export function ProviderForm({
  provider,
  save,
  cancel,
}: {
  provider: Provider | undefined
  save: Save
  cancel: () => void
}) {
  return (
    <form
      className="grid gap-4 rounded-xl border p-5"
      onSubmit={async (event) => {
        event.preventDefault()
        const form = event.currentTarget
        const fields = new FormData(form)
        const baseURL = String(fields.get("baseURL") ?? "").trim()
        const key = String(fields.get("key") ?? "")
        if (
          await save({
            action: "provider",
            provider: {
              id: fields.get("id"),
              label: fields.get("label"),
              kind: fields.get("kind"),
              ...(baseURL ? { baseURL } : {}),
            },
            ...(key ? { key } : {}),
          })
        ) {
          form.reset()
          cancel()
        }
      }}
    >
      <h3 className="font-semibold">{provider ? `Edit ${provider.label}` : "Add provider"}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Provider id"
          autoFocus={provider === undefined}
          name="id"
          defaultValue={provider?.id}
          readOnly={provider !== undefined}
          required
          maxLength={64}
          pattern="[a-z0-9][a-z0-9.\-]*"
          placeholder="openai"
        />
        <Field
          label="Provider label"
          autoFocus={provider !== undefined}
          name="label"
          defaultValue={provider?.label}
          required
          maxLength={120}
          placeholder="OpenAI"
        />
        <label className="grid gap-2 text-sm font-medium">
          Provider type
          <select
            name="kind"
            defaultValue={provider?.kind ?? "openai"}
            className="h-10 w-full rounded-md border bg-background px-3 text-base sm:text-sm"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
            <option value="openai-compatible">OpenAI-compatible</option>
          </select>
        </label>
        <Field
          label="Base URL (compatible providers)"
          name="baseURL"
          type="url"
          defaultValue={provider?.baseURL}
          maxLength={2048}
          placeholder="https://openrouter.ai/api/v1"
        />
      </div>
      <Field
        label={provider ? "Replace API key (optional)" : "API key (optional)"}
        name="key"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={4096}
      />
      <p className="text-sm text-muted-foreground">
        Leave the key blank to keep the current key. Saved keys cannot be viewed. Other compatible endpoints need a
        matching custom provider in AI Gateway.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Save provider</Button>
        <Button type="button" variant="outline" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
