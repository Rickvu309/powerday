import {
  officeItems,
  officeTemplates,
  type OfficeItem,
  type OfficeKind,
  type OfficeOrigin,
  type OfficeTemplate,
} from "./office-registry"

export type OfficeTab = "suggested" | "favorites" | OfficeOrigin

export type OfficeView = {
  readonly tab: OfficeTab
  readonly kind: OfficeKind | null
  readonly query: string
}

export type OfficeSelection = {
  readonly gallery: readonly OfficeTemplate[]
  readonly items: readonly OfficeItem[]
}

export const officeSelection = (view: OfficeView): OfficeSelection => {
  const words = view.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matchesTitle = (title: string) => words.every((word) => title.toLowerCase().includes(word))
  const matchesKind = (kind: OfficeKind) => view.kind === null || view.kind === kind
  return {
    gallery:
      view.tab === "suggested"
        ? officeTemplates.filter(
            (template) => matchesKind(template.document.kind) && matchesTitle(template.document.title),
          )
        : [],
    items: officeItems.filter(
      (item) =>
        matchesKind(item.document.kind) &&
        matchesTitle(item.document.title) &&
        (view.tab === "suggested"
          ? item.origin === "yours"
          : view.tab === "favorites"
            ? item.favorite
            : item.origin === view.tab),
    ),
  }
}
