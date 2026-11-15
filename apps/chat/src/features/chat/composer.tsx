import { ArrowUpIcon, SquareIcon } from "lucide-react"
import { memo, useRef, useState } from "react"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"

const finePointer = matchMedia("(pointer: fine)").matches

export const Composer = memo(function Composer({
  busy,
  ready,
  onSend,
  onStop,
}: {
  busy: boolean
  ready: boolean
  onSend: (text: string) => void
  onStop: () => void
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  const [empty, setEmpty] = useState(true)
  const refocus = () => {
    field.current?.focus()
  }
  return (
    <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
      <PromptInput
        className="*:data-[slot=input-group]:rounded-3xl *:data-[slot=input-group]:bg-card! *:data-[slot=input-group]:has-disabled:opacity-100! *:data-[slot=input-group]:shadow-sm *:data-[slot=input-group]:has-focus-visible:border-muted-foreground/40! *:data-[slot=input-group]:has-focus-visible:ring-0!"
        onSubmit={({ text }) => {
          const said = text.trim()
          if (said === "" || busy || !ready) return
          onSend(said)
          setEmpty(true)
          refocus()
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            ref={field}
            aria-label="Message"
            placeholder="Message Power Chat"
            autoFocus={finePointer}
            className="min-h-14 px-4 pt-4 text-base md:text-base"
            onChange={(event) => setEmpty(event.currentTarget.value.trim() === "")}
            onKeyDown={(event) => {
              if (busy && event.key === "Enter" && !event.shiftKey) event.preventDefault()
            }}
          />
        </PromptInputBody>
        <PromptInputFooter className="justify-end px-3 pb-3">
          <PromptInputSubmit
            aria-label={busy ? "Stop display" : "Send"}
            className="rounded-full"
            status={busy ? "streaming" : "ready"}
            disabled={!busy && (empty || !ready)}
            onStop={() => {
              onStop()
              refocus()
            }}
          >
            {busy ? <SquareIcon className="fill-current" /> : <ArrowUpIcon />}
          </PromptInputSubmit>
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
})
