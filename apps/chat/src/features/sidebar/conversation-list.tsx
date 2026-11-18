import type { Found } from "@powerday/chat-core"
import { SearchIcon, SquarePenIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar"
import { openConversation, useOpenConversation } from "@/open-conversation"
import { groupByAge } from "./age-groups"
import { useConversationCache, useListing } from "./conversation-cache"
import { ConversationItem, ConversationLink, type Go } from "./conversation-item"

export const searchFieldId = "chat-search"

let searchOpenState = false
const searchOpenListeners = new Set<() => void>()

export const subscribeSearchOpen = (notify: () => void) => {
  searchOpenListeners.add(notify)
  return () => {
    searchOpenListeners.delete(notify)
  }
}

export const readSearchOpen = () => searchOpenState

export const openSearch = () => {
  searchOpenState = true
  searchOpenListeners.forEach((notify) => notify())
}

export const closeSearch = () => {
  searchOpenState = false
  searchOpenListeners.forEach((notify) => notify())
}

function Note({ role, children }: { role?: "status"; children: ReactNode }) {
  return (
    <p tabIndex={role === "status" ? 0 : undefined} role={role} className="px-2 text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function Retry({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <>
      <Note role="status">{label}</Note>
      <Button variant="link" size="sm" onClick={onClick}>
        Try again
      </Button>
    </>
  )
}

function Section({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>{children}</SidebarGroupContent>
    </SidebarGroup>
  )
}

function More() {
  const cache = useConversationCache()
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) cache.more()
    })
    if (sentinel.current) observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [cache])
  return <div ref={sentinel} className="h-px" />
}

function Recents({ go }: { go: Go }) {
  const cache = useConversationCache()
  const listing = useListing()
  const open = useOpenConversation()

  if (listing.status === "loading") {
    return (
      <Section label="Recents">
        <SidebarMenu aria-busy>
          {Array.from({ length: 6 }, (_, index) => (
            <SidebarMenuItem key={index}>
              <SidebarMenuSkeleton />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </Section>
    )
  }
  if (listing.status === "failed") {
    return (
      <Section label="Recents">
        <Retry label="Couldn’t load your chats." onClick={cache.load} />
      </Section>
    )
  }
  if (listing.conversations.length === 0) {
    return (
      <Section label="Recents">
        <Note>Your chats will show here.</Note>
      </Section>
    )
  }
  return (
    <>
      {groupByAge(listing.conversations, new Date()).map(({ age, conversations }) => (
        <Section key={age} label={age}>
          <SidebarMenu>
            {conversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                open={conversation.id === open}
                go={go}
              />
            ))}
          </SidebarMenu>
        </Section>
      ))}
      {listing.moreFailed ? (
        <SidebarGroup className="items-start group-data-[collapsible=icon]:hidden">
          <Retry label="Couldn’t load older chats." onClick={cache.more} />
        </SidebarGroup>
      ) : (
        listing.next !== undefined && <More key={listing.conversations.length} />
      )}
    </>
  )
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const words = query
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const pieces = text.split(new RegExp(`(${words.join("|")})`, "giu"))
  return pieces.map((piece, index) =>
    index % 2 ? (
      <strong key={index} className="font-medium text-sidebar-foreground">
        {piece}
      </strong>
    ) : (
      piece
    ),
  )
}

type Search = { readonly query: string } & (
  | { readonly status: "ready"; readonly found: readonly Found[] }
  | { readonly status: "failed" }
)

function Results({ query, go }: { query: string; go: Go }) {
  const cache = useConversationCache()
  const open = useOpenConversation()
  const [search, setSearch] = useState<Search>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    cache.search(query, controller.signal).then(
      (found) => {
        if (!controller.signal.aborted) setSearch({ query, status: "ready", found })
      },
      () => {
        if (!controller.signal.aborted) setSearch({ query, status: "failed" })
      },
    )
    return () => controller.abort()
  }, [cache, query, attempt])

  const pending = search === undefined || search.query !== query
  const announcement = pending
    ? "Searching chats…"
    : search.status === "failed"
      ? "Couldn’t search your chats."
      : search.found.length === 0
        ? `No chats match “${search.query}”.`
        : `${search.found.length} ${search.found.length === 1 ? "chat" : "chats"} found.`
  return (
    <Section label="Results">
      <div className="flex flex-col items-start gap-2">
        <p
          role="status"
          aria-live="polite"
          className={
            search?.status === "ready" && search.found.length > 0 ? "sr-only" : "px-2 text-sm text-muted-foreground"
          }
        >
          {announcement}
        </p>
        {!pending && search?.status === "failed" && (
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setSearch(undefined)
              setAttempt((value) => value + 1)
            }}
          >
            Try again
          </Button>
        )}
      </div>
      {search?.status === "ready" && (
        <SidebarMenu aria-busy={pending}>
          {search.found.map(({ conversation, snippet }) => (
            <SidebarMenuItem key={conversation.id}>
              <ConversationLink conversation={conversation} open={conversation.id === open} go={go}>
                <span className="flex min-w-0 flex-col py-1">
                  <span className="truncate">
                    <Highlighted text={conversation.title} query={search.query} />
                  </span>
                  {snippet && (
                    <span className="line-clamp-2 text-xs whitespace-normal text-muted-foreground">
                      <Highlighted text={snippet} query={search.query} />
                    </span>
                  )}
                </span>
              </ConversationLink>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      )}
    </Section>
  )
}

export function ConversationList({ initialQuery = "" }: { initialQuery?: string }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const [query, setQuery] = useState(initialQuery)
  const searchOpen = useSyncExternalStore(subscribeSearchOpen, readSearchOpen, () => false)
  useEffect(() => {
    if (initialQuery !== "") openSearch()
  }, [initialQuery])
  const collapse = useCallback(() => {
    closeSearch()
    setQuery("")
  }, [])
  const go: Go = useCallback(
    (id) => {
      openConversation(id, { focus: true })
      if (!isMobile) collapse()
      if (isMobile) setOpenMobile(false)
    },
    [isMobile, setOpenMobile, collapse],
  )
  const trimmed = query.trim()
  const fieldOpen = searchOpen || isMobile

  return (
    <>
      <SidebarGroup>
        <SidebarMenu className="flex-row items-center gap-1">
          <SidebarMenuItem className="min-w-0 flex-1">
            <SidebarMenuButton onClick={() => go(null)}>
              <SquarePenIcon className="text-primary" />
              <span>New chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {!isMobile && (
            <SidebarMenuItem className="shrink-0">
              <SidebarMenuButton
                tooltip="Search chats"
                aria-label="Search chats"
                className="size-8"
                onClick={() => (searchOpen ? collapse() : openSearch())}
              >
                <SearchIcon />
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
        {fieldOpen && (
          <div className="relative mt-1">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <SidebarInput
              id={searchFieldId}
              autoFocus={!isMobile}
              className="h-8 border-transparent! bg-muted pl-8 focus-visible:bg-accent focus-visible:outline-none! focus-visible:ring-0"
              type="search"
              aria-label="Search chats"
              placeholder="Search chats"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("")
              }}
            />
          </div>
        )}
      </SidebarGroup>
      {trimmed ? <Results query={trimmed} go={go} /> : <Recents go={go} />}
    </>
  )
}
