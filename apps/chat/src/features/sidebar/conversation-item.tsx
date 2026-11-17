import type { Conversation, ConversationId } from "@powerday/chat-core"
import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { memo, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarInput, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { openConversation } from "@/open-conversation"
import { useConversationCache } from "./conversation-cache"

export type Go = (id: ConversationId | null) => void

const followLink = (event: MouseEvent, go: () => void) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  go()
}

export function ConversationLink({
  conversation,
  open,
  go,
  children,
}: {
  conversation: Conversation
  open: boolean
  go: Go
  children: ReactNode
}) {
  const cache = useConversationCache()
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            isActive={open}
            render={<a href={`/c/${encodeURIComponent(conversation.id)}`} aria-current={open ? "page" : undefined} />}
            onClick={(event) => followLink(event, () => go(conversation.id))}
            onPointerEnter={() => cache.open(conversation.id)}
            onFocus={() => cache.open(conversation.id)}
            className="h-auto min-h-8"
          >
            {children}
          </SidebarMenuButton>
        }
      />
      <TooltipContent
        role="tooltip"
        side="right"
        className="max-w-[min(20rem,calc(100vw-2rem))] whitespace-normal [overflow-wrap:anywhere]"
      >
        {conversation.title}
      </TooltipContent>
    </Tooltip>
  )
}

function RenameField({ title, onDone }: { title: string; onDone: (title: string | undefined) => void }) {
  const done = useRef(false)
  const finish = (next: string | undefined) => {
    if (done.current) return
    done.current = true
    const trimmed = next?.trim()
    onDone(trimmed && trimmed !== title ? trimmed : undefined)
  }
  return (
    <SidebarInput
      autoFocus
      aria-label="Chat title"
      defaultValue={title}
      maxLength={200}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => finish(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(event.currentTarget.value)
        if (event.key === "Escape") finish(undefined)
      }}
    />
  )
}

export const ConversationItem = memo(function ConversationItem({
  conversation,
  open,
  go,
}: {
  conversation: Conversation
  open: boolean
  go: Go
}) {
  const cache = useConversationCache()
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { id, title } = conversation

  return (
    <SidebarMenuItem>
      {renaming ? (
        <RenameField
          title={title}
          onDone={(next) => {
            if (next !== undefined) cache.rename(id, next)
            setRenaming(false)
          }}
        />
      ) : (
        <ConversationLink conversation={conversation} open={open} go={go}>
          <span className="truncate">{title}</span>
        </ConversationLink>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction showOnHover className="top-1 size-6 after:hidden" aria-label={`Options for ${title}`} />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" className="w-72 max-w-[calc(100vw-2rem)]">
          <DropdownMenuGroup>
            <DropdownMenuLabel
              render={<h2 />}
              aria-hidden={false}
              className="max-w-72 whitespace-normal leading-[1.4] [overflow-wrap:anywhere]"
            >
              {title}
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>This deletes “{title}” and its messages. You can’t undo this.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                cache.delete(id)
                setDeleting(false)
                if (open) openConversation(null)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarMenuItem>
  )
})
