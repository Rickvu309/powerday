import type { AdminOverview } from "@powerday/chat-core"
import { Button } from "@/components/ui/button"
import { Field } from "./field"
import type { Save } from "./admin"

export function ModelForm({
  model,
  providers,
  save,
  cancel,
}: {
  model: AdminOverview["models"][number] | undefined
  providers: AdminOverview["providers"]
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
        if (
          await save({
            action: "model",
            model: {
              id: fields.get("id"),
              label: fields.get("label"),
              provider: fields.get("provider"),
              upstreamId: fields.get("upstreamId"),
              contextWindow: Number(fields.get("contextWindow")),
              status: fields.has("enabled") ? "enabled" : "disabled",
              price: model?.price ?? String(fields.get("id")),
              capabilities: {
                tools: fields.has("tools"),
                vision: fields.has("vision"),
                reasoning: fields.has("reasoning"),
              },
            },
          })
        )
          cancel()
      }}
    >
      <h3 className="font-semibold">{model ? `Edit ${model.label}` : "Add model"}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Model id"
          autoFocus={model === undefined}
          name="id"
          defaultValue={model?.id}
          readOnly={model !== undefined}
          required
          maxLength={64}
          pattern="[a-z0-9][a-z0-9.\-]*"
          placeholder="my-model"
        />
        <Field
          autoFocus={model !== undefined}
          label="Model label"
          name="label"
          defaultValue={model?.label}
          required
          maxLength={120}
        />
        <label className="grid gap-2 text-sm font-medium">
          Provider
          <select
            name="provider"
            defaultValue={model?.provider}
            required
            className="h-10 w-full rounded-md border bg-background px-3 text-base sm:text-sm"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <Field label="Upstream model id" name="upstreamId" defaultValue={model?.upstreamId} required maxLength={200} />
        <Field
          label="Context window (tokens)"
          name="contextWindow"
          type="number"
          min={1}
          max={10000000}
          defaultValue={model?.contextWindow ?? 128000}
          required
        />
      </div>
      <fieldset className="flex flex-wrap gap-5">
        <legend className="mb-3 text-sm font-medium">Capabilities</legend>
        {(["tools", "vision", "reasoning"] as const).map((name) => (
          <label key={name} className="flex min-h-10 items-center gap-2 text-sm capitalize">
            <input type="checkbox" name={name} defaultChecked={model?.capabilities[name] ?? false} />
            {name}
          </label>
        ))}
      </fieldset>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={model?.status !== "disabled"} />
        Enable model for chat
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Save model</Button>
        <Button type="button" variant="outline" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
