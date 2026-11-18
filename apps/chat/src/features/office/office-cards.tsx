import { cn } from "cn"
import { showComingSoon } from "@/features/toast/coming-soon"
import { officeLift, officeMark } from "./office-art"
import type { OfficeItem, OfficeKind, OfficeTemplate } from "./office-registry"

const framed: Record<OfficeKind, boolean> = {
  page: true,
  slides: false,
  site: true,
  image: false,
}

const itemBody: Record<OfficeKind, string> = {
  page: "aspect-[3/4]",
  slides: "aspect-video",
  site: "aspect-[16/10]",
  image: "aspect-square",
}

export function TemplateCard({ template }: { template: OfficeTemplate }) {
  const { document, label, Badge } = template
  return (
    <li className="w-54 shrink-0">
      <button type="button" onClick={() => showComingSoon(document.title)} className="block w-full text-left">
        <span className="relative block aspect-video overflow-hidden rounded-xl border bg-sidebar">
          {framed[document.kind] ? (
            <span className="absolute inset-x-[11%] top-[12%] h-full overflow-hidden rounded-t-md border bg-card">
              {Badge ? (
                <span className="block px-2 pt-2 [&_svg]:size-3.5">
                  <Badge />
                </span>
              ) : null}
              <document.Preview />
            </span>
          ) : (
            <span className="block h-full w-full">
              <document.Preview />
            </span>
          )}
        </span>
        <span className="mt-3 block text-center">
          <span className="block truncate text-sm font-medium">{document.title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{label}</span>
        </span>
      </button>
    </li>
  )
}

export function ItemCard({ item }: { item: OfficeItem }) {
  const Mark = officeMark[item.document.kind]
  return (
    <li className="w-48">
      <button type="button" onClick={() => showComingSoon(item.document.title)} className="block w-full text-left">
        <span className="block overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: officeLift }}>
          <span className="flex items-center gap-2 border-b px-3 py-2">
            <span className="[&_svg]:size-4 [&_svg]:shrink-0">
              <Mark />
            </span>
            <span className="truncate text-sm font-medium">{item.document.title}</span>
          </span>
          <span className={cn("block overflow-hidden", itemBody[item.document.kind])}>
            <item.document.Preview />
          </span>
        </span>
      </button>
    </li>
  )
}
