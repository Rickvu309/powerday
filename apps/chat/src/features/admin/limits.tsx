import type { AdminOverview } from "@powerday/chat-core"
import { Button } from "@/components/ui/button"
import { Field } from "./field"
import type { Save } from "./admin"

export function Limits({ limits, save }: { limits: AdminOverview["limits"]; save: Save }) {
  return (
    <section className="grid gap-5" aria-labelledby="limits-title">
      <div>
        <h2 id="limits-title" className="text-xl font-semibold">
          Daily limits
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Input and output tokens count toward the allowance. Limits reset at midnight UTC.
        </p>
      </div>
      <form
        className="grid gap-4 rounded-xl border p-5 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault()
          const fields = new FormData(event.currentTarget)
          await save({ action: "limit", tokens: Number(fields.get("tokens")) })
        }}
      >
        <Field
          label="Default daily tokens"
          name="tokens"
          type="number"
          min={0}
          max={1000000000}
          defaultValue={limits.find((l) => l.email === "")?.tokens}
          required
        />
        <Button type="submit" className="self-end justify-self-start">
          Save default
        </Button>
      </form>
      <form
        className="grid gap-4 rounded-xl border p-5 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault()
          const form = event.currentTarget
          const fields = new FormData(form)
          if (await save({ action: "limit", email: fields.get("email"), tokens: Number(fields.get("tokens")) }))
            form.reset()
        }}
      >
        <Field
          label="Override email"
          name="email"
          type="email"
          autoComplete="off"
          maxLength={254}
          required
          placeholder="person@example.com"
        />
        <Field label="Daily tokens" name="tokens" type="number" min={0} max={1000000000} required />
        <Button type="submit" className="justify-self-start">
          Save override
        </Button>
      </form>
      <ul className="grid gap-3">
        {limits
          .filter((l) => l.email !== "")
          .map((limit) => (
            <li key={limit.email} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <span className="min-w-0 break-words text-sm">
                <span>{limit.email}</span>
                <span className="block tabular-nums text-muted-foreground">
                  {limit.tokens.toLocaleString()} tokens / day
                </span>
              </span>
              <Button
                variant="outline"
                onClick={() => void save({ action: "limit", email: limit.email, tokens: null })}
              >
                Use default
              </Button>
            </li>
          ))}
      </ul>
    </section>
  )
}
