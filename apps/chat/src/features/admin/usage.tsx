import type { AdminOverview } from "@powerday/chat-core"

type Total = { label: string; today: number; week: number }
const aggregate = (usage: AdminOverview["usage"], field: "email" | "model") => {
  const totals = new Map<string, Total>()
  for (const row of usage) {
    const label = row[field]
    const prior = totals.get(label) ?? { label, today: 0, week: 0 }
    totals.set(label, { label, today: prior.today + row.today, week: prior.week + row.week })
  }
  return [...totals.values()].sort((a, b) => b.week - a.week)
}

function Totals({ title, rows }: { title: string; rows: Total[] }) {
  return (
    <div className="grid gap-3">
      <h3 className="font-medium">{title}</h3>
      <div className="overflow-x-auto rounded-xl border" tabIndex={0} role="region" aria-label={title}>
        <table className="w-full text-start text-sm">
          <caption className="sr-only">{title}: tokens today and in the last 7 days</caption>
          <thead>
            <tr className="border-b bg-muted">
              <th scope="col" className="p-4 text-start">
                {title === "By person" ? "Person" : "Model"}
              </th>
              <th scope="col" className="p-4 text-end">
                Today
              </th>
              <th scope="col" className="p-4 text-end">
                Last 7 days
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b last:border-0">
                <th scope="row" className="break-all p-4 text-start font-normal">
                  {row.label}
                </th>
                <td className="p-4 text-end tabular-nums">{row.today.toLocaleString()}</td>
                <td className="p-4 text-end tabular-nums">{row.week.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Usage({ usage, users }: { usage: AdminOverview["usage"]; users: AdminOverview["users"] }) {
  return (
    <section className="grid gap-5" aria-labelledby="usage-title">
      <div>
        <h2 id="usage-title" className="text-xl font-semibold">
          Usage
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The last 7 days include today, in UTC. Input and output tokens count once.
        </p>
      </div>
      <div className="grid min-w-0 gap-3">
        <h3 className="font-medium">Effective limits</h3>
        <ul className="grid min-w-0 gap-3">
          {users.map((user) => (
            <li key={user.email} className="rounded-xl border p-4 text-sm [overflow-wrap:anywhere]">
              {user.email}
              <span className="block text-muted-foreground">
                {user.tokens.toLocaleString()} tokens / {user.period}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {usage.length === 0 ? (
        <p className="rounded-xl border p-5 text-sm text-muted-foreground">
          No usage yet. Tokens appear here after someone chats.
        </p>
      ) : (
        <>
          <Totals title="By person" rows={aggregate(usage, "email")} />
          <Totals title="By model" rows={aggregate(usage, "model")} />
        </>
      )}
    </section>
  )
}
