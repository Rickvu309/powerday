import { ArrowUpIcon, SquareIcon } from "lucide-react"
import { memo, useRef, useSyncExternalStore } from "react"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
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
    <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-[calc(16px+var(--safe-area-bottom,env(safe-area-inset-bottom,0px)))]">
      <form
        className="group/composer w-full"
        onSubmit={(event) => {
          event.preventDefault()
          if (empty || busy || !ready) return
          if (onSend(text)) field.current?.focus()
        }}
      >
        <InputGroup className="overflow-hidden rounded-3xl bg-card! shadow-sm has-disabled:opacity-100! has-focus-visible:border-muted-foreground/40! has-focus-visible:ring-0!">
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
            className="max-h-48 min-h-14 px-4 pt-4 text-base md:text-base"
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
          <InputGroupAddon align="block-end" className="justify-end gap-1 px-3 pb-3">
            <InputGroupButton
              type={busy ? "button" : "submit"}
              aria-label={busy ? "Stop display" : "Send"}
              className="rounded-full pointer-coarse:size-11 [&_svg]:size-4"
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
