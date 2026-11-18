import { ArrowDownWideNarrowIcon, ChevronDownIcon, LayoutGridIcon, ListIcon } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { showComingSoon } from "@/features/toast/coming-soon"
import { ItemCard, TemplateCard } from "./office-cards"
import { officeSelection, type OfficeTab } from "./office-filters"
import { useOfficeKind } from "./office-kind"

const tabs: readonly OfficeTab[] = ["suggested", "favorites", "yours", "shared"]
const tabLabel: Record<OfficeTab, string> = {
  suggested: "Suggested",
  favorites: "Favorites",
  yours: "Your items",
  shared: "Shared with you",
}
const createPill = "h-9 rounded-full bg-foreground px-4 text-background hover:bg-foreground/90"

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-8 text-sm text-muted-foreground">{children}</p>
}

const itemsEmptyCopy = (tab: OfficeTab) =>
  tab === "favorites"
    ? "Pages and slides you star will show here."
    : tab === "shared"
      ? "Pages and slides shared with you will show here."
      : "No items match. Pick another kind or clear the search."

export function Office() {
  const kind = useOfficeKind()
  const [tab, setTab] = useState<OfficeTab>("suggested")
  const [query, setQuery] = useState("")
  const selection = officeSelection({ tab, kind, query })
  useEffect(() => {
    document.title = "Power Chat Office"
    if (!document.querySelector('[data-mobile="true"]')) document.getElementById("office-title")?.focus()
  }, [])
  return (
    <div className="px-4 pt-6 pb-16 md:px-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="office-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight">
          All
        </h1>
        <div className="flex items-center gap-2">
          <Input
            type="search"
            aria-label="Search office"
            placeholder="Search"
            className="h-9 w-56 rounded-full"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("")
            }}
          />
          <Button className={createPill} onClick={() => showComingSoon("Creating")}>
            Create
            <ChevronDownIcon />
          </Button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Filter" className="flex flex-wrap items-center gap-1">
          {tabs.map((each) => (
            <Button
              key={each}
              variant="ghost"
              size="lg"
              aria-pressed={tab === each}
              className="rounded-full px-3.5 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm"
              onClick={() => setTab(each)}
            >
              {tabLabel[each]}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Sort" onClick={() => showComingSoon("Sorting")}>
            <ArrowDownWideNarrowIcon />
          </Button>
          <Button variant="ghost" size="icon" aria-pressed={true} aria-label="Grid view">
            <LayoutGridIcon />
          </Button>
          <Button variant="ghost" size="icon" aria-label="List view" onClick={() => showComingSoon("List view")}>
            <ListIcon />
          </Button>
        </div>
      </div>
      {tab === "suggested" ? (
        <section aria-labelledby="office-gallery-title" className="mt-8">
          <h2 id="office-gallery-title" className="text-xl font-semibold">
            Create together in Office
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a template to start working with Power Chat and your team
          </p>
          {selection.gallery.length === 0 ? (
            <EmptyNote>No templates match. Pick another kind or clear the search.</EmptyNote>
          ) : (
            <div
              role="region"
              aria-label="Templates"
              tabIndex={0}
              className="no-scrollbar -mx-4 mt-4 overflow-x-auto py-1 md:-mx-16"
            >
              <ul className="flex list-none gap-4 px-4 md:px-16">
                {selection.gallery.map((template) => (
                  <TemplateCard key={template.document.id} template={template} />
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : null}
      <section aria-labelledby="office-items-title" className="mt-10">
        <h2 id="office-items-title" className="sr-only">
          Items
        </h2>
        {selection.items.length === 0 ? (
          <EmptyNote>{itemsEmptyCopy(tab)}</EmptyNote>
        ) : (
          <ul className="mt-4 flex flex-wrap items-start gap-5">
            {selection.items.map((item) => (
              <ItemCard key={item.document.id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
