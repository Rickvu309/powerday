import { cn } from "cn"
import { showComingSoon } from "@/features/toast/coming-soon"
import { officeLift, officeMark } from "./office-art"
import type { OfficeItem, OfficeKind, OfficeTemplate } from "./office-registry"

const templateSheet: Record<OfficeKind, string> = {
  page: "h-[72%]",
  slides: "h-full",
  site: "h-[72%]",
  image: "h-full",
}

const itemBody: Record<OfficeKind, string> = {
  page: "aspect-[3/4]",
  slides: "aspect-video",
  site: "aspect-[16/10]",
  image: "aspect-square",
}

export function TemplateCard({ template }: { template: OfficeTemplate }) {
  const { document, label } = template
  return (
    <li className="w-60 shrink-0">
      <button type="button" onClick={() => showComingSoon(document.title)} className="block w-full text-left">
        <span className="flex aspect-[16/10] items-end overflow-hidden rounded-xl bg-muted">
          <span className={cn("w-full overflow-hidden rounded-t-lg bg-card", templateSheet[document.kind])}>
            <document.Preview />
          </span>
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
    <li className="w-52">
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
