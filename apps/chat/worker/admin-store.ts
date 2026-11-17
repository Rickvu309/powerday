import {
  UsageLimits,
  catalogData,
  parseCatalog,
  type AdminMutation,
  type AdminStore,
  type CatalogSource,
  type KeyVault,
} from "@powerday/chat-core"

export const adminStore = (
  db: D1Database,
  seed: unknown,
  vault: KeyVault,
  limitSeed?: unknown,
): AdminStore & CatalogSource => {
  const seeded = async () => {
    const find = () =>
      db.prepare("SELECT body, revision FROM admin_catalog WHERE id = 1").first<{ body: string; revision: number }>()
    const existing = await find()
    if (existing !== null) return existing
    const limits = limitSeed === undefined ? undefined : UsageLimits.parse(limitSeed)
    await db.batch([
      ...(limits === undefined
        ? []
        : [
            db
              .prepare("INSERT OR IGNORE INTO admin_limits SELECT '', ? WHERE NOT EXISTS (SELECT 1 FROM admin_catalog)")
              .bind(limits.default.tokens),
          ]),
      db
        .prepare("INSERT OR IGNORE INTO admin_catalog (id, body) VALUES (1, ?)")
        .bind(JSON.stringify(catalogData(parseCatalog(seed)))),
    ])
    const row = await find()
    if (row === null) throw new Error("Catalog unavailable")
    return row
  }
  return {
    read: async () => parseCatalog(JSON.parse((await seeded()).body)),
    overview: async (now) => {
      const catalog = catalogData(parseCatalog(JSON.parse((await seeded()).body)))
      const [keys, limits, usage] = await Promise.all([
        db.prepare("SELECT provider, suffix, updated_at AS updatedAt FROM provider_keys").all(),
        db.prepare("SELECT email, tokens FROM admin_limits").all(),
        db
          .prepare(`SELECT coalesce(u.email, e.user) AS email, e.model, sum(e.input_tokens + e.output_tokens) AS week,
          sum(CASE WHEN e.at >= ? THEN e.input_tokens + e.output_tokens ELSE 0 END) AS today
          FROM usage_events e LEFT JOIN "user" u ON u.id = e.user WHERE e.at >= ? GROUP BY e.user, e.model`)
          .bind(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6),
          )
          .all(),
      ])
      return { ...catalog, keys: keys.results, limits: limits.results, usage: usage.results }
    },
    mutate: async (input: AdminMutation, actor, at, id) => {
      const sealed = input.action === "provider" && input.key !== undefined ? await vault.seal(input.key) : undefined
      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await seeded()
        const parsed = parseCatalog(JSON.parse(row.body))
        const catalog = { providers: new Map(parsed.providers), models: new Map(parsed.models) }
        const statements: D1PreparedStatement[] = []
        switch (input.action) {
          case "provider":
            catalog.providers.set(input.provider.id, input.provider)
            if (sealed !== undefined && input.key !== undefined)
              statements.push(
                db
                  .prepare(
                    `INSERT INTO provider_keys VALUES (?, ?, ?, ?) ON CONFLICT(provider) DO UPDATE SET ciphertext=excluded.ciphertext, suffix=excluded.suffix, updated_at=excluded.updated_at`,
                  )
                  .bind(input.provider.id, sealed, `…${input.key.slice(-4)}`, at.getTime()),
              )
            break
          case "remove-provider":
            catalog.providers.delete(input.id)
            for (const model of catalog.models.values())
              if (model.provider === input.id) catalog.models.delete(model.id)
            statements.push(db.prepare("DELETE FROM provider_keys WHERE provider = ?").bind(input.id))
            break
          case "model": {
            const updated = parseCatalog({
              ...catalogData(catalog),
              models: [...catalog.models.values()].filter((m) => m.id !== input.model.id).concat(input.model),
            })
            catalog.models.set(input.model.id, updated.models.get(input.model.id)!)
            break
          }
          case "remove-model":
            catalog.models.delete(input.id)
            break
          case "limit":
            if (input.tokens === null) {
              if (input.email === undefined) throw new Error("Default required")
              statements.push(db.prepare("DELETE FROM admin_limits WHERE email = ?").bind(input.email))
            } else
              statements.push(
                db
                  .prepare(
                    "INSERT INTO admin_limits VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET tokens=excluded.tokens",
                  )
                  .bind(input.email ?? "", input.tokens),
              )
            break
        }
        try {
          await db.batch([
            db
              .prepare(
                "INSERT INTO admin_audit SELECT ?, ?, CASE WHEN revision = ? THEN ? ELSE NULL END, ? FROM admin_catalog WHERE id = 1",
              )
              .bind(id, actor, row.revision, input.action, at.getTime()),
            db
              .prepare("UPDATE admin_catalog SET body = ?, revision = revision + 1 WHERE id = 1")
              .bind(JSON.stringify(catalogData(catalog))),
            ...statements,
          ])
        } catch (error) {
          if (attempt === 4) throw error
          continue
        }
        return
      }
      throw new Error("Catalog changed; try again")
    },
  }
}
