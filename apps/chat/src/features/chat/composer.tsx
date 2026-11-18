import { ArrowUpIcon, MicIcon, PlusIcon, SquareIcon } from "lucide-react"
import { showComingSoon } from "@/features/toast/coming-soon"
import { memo, useRef, useSyncExternalStore } from "react"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { ModelPicker } from "@/features/model-picker/model-picker"
import { preloadThread } from "./thread-loader"
import type { LiveConversation } from "./live-chats"

const finePointer = matchMedia("(pointer: fine)").matches

export const Composer = memo(function Composer({
  draft,
  busy,
  ready,
  onSend,
  onStop,
}: {
  draft: LiveConversation["draft"]
  busy: boolean
  ready: boolean
  onSend: (text: string) => boolean
  onStop: () => void
}) {
  const text = useSyncExternalStore(draft.subscribe, draft.read)
  const field = useRef<HTMLTextAreaElement>(null)
  const empty = text.trim() === ""
  return (
    <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-[calc(16px+var(--safe-area-bottom))] md:group-has-data-chat-empty/chat:pb-0">
      <form
        className="group/composer w-full"
        onSubmit={(event) => {
          event.preventDefault()
          if (empty || busy || !ready) return
          if (onSend(text)) field.current?.focus()
        }}
      >
        <InputGroup className="flex-wrap items-end gap-x-1 rounded-[1.75rem] border-border bg-card! p-1.5 shadow-lg shadow-foreground/5 has-disabled:opacity-100! has-focus-visible:border-foreground! has-focus-visible:ring-0! has-focus-visible:outline-none!">
          <InputGroupButton
            aria-label="Attach"
            size="icon-sm"
            className="size-9 rounded-full text-foreground max-md:order-1 pointer-coarse:size-11 [&_svg]:size-5"
            onClick={() => showComingSoon("Attachments")}
          >
            <PlusIcon />
          </InputGroupButton>
          <InputGroupTextarea
            ref={field}
            onPointerDown={() => {
              void preloadThread().catch(() => {})
            }}
            onFocus={(event) => {
              if (event.relatedTarget !== null) void preloadThread().catch(() => {})
            }}
            name="message"
            aria-label="Message"
            placeholder="Message Power Chat"
            autoFocus={finePointer}
            enterKeyHint={finePointer ? "send" : "enter"}
            value={text}
            className="max-h-48 min-h-9 min-w-0 grow basis-0 px-3 py-1.5 text-base max-md:order-first max-md:basis-full md:text-base"
            onChange={(event) => draft.edit(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing ||
                (!finePointer && !event.ctrlKey && !event.metaKey)
              )
                return
              event.preventDefault()
              if (!empty && !busy && ready) event.currentTarget.form?.requestSubmit()
            }}
          />
          <InputGroupAddon
            align="inline-end"
            className="ml-auto min-w-0 cursor-default gap-1 py-0 pr-0 has-[>button]:mr-0 max-md:order-2"
          >
            <ModelPicker />
            <InputGroupButton
              aria-label="Voice"
              size="icon-sm"
              className="size-9 rounded-full text-muted-foreground pointer-coarse:size-11 [&_svg]:size-5"
              onClick={() => showComingSoon("Voice")}
            >
              <MicIcon />
            </InputGroupButton>
            <InputGroupButton
              type={busy ? "button" : "submit"}
              aria-label={busy ? "Stop display" : "Send"}
              className="size-9 rounded-full bg-foreground text-background hover:bg-foreground/85 disabled:bg-foreground/25 disabled:opacity-100 pointer-coarse:size-11 [&_svg]:size-5"
              size="icon-sm"
              variant="default"
              disabled={!busy && (empty || !ready)}
              onClick={
                busy
                  ? (event) => {
                      event.preventDefault()
                      onStop()
                      field.current?.focus()
                    }
                  : undefined
              }
            >
              {busy ? <SquareIcon className="fill-current" /> : <ArrowUpIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {finePointer ? (
          <p className="h-5 pt-1 text-xs text-muted-foreground invisible group-focus-within/composer:visible">
            Enter to send / Shift+Enter for newline
          </p>
        ) : null}
      </form>
    </div>
  )
})
