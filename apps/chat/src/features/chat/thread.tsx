import type { ChatMessage } from "@powerday/chat-core"
import type { ChatStatus } from "ai"
import { CheckIcon, ChevronRightIcon, CircleAlertIcon, CopyIcon, LogInIcon, RotateCcwIcon } from "lucide-react"
import { memo, useState, type ReactNode } from "react"
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation"
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/class-names"
import { OverLimit } from "./over-limit"
import { TooLong } from "./too-long"
import { problemOf, sessionExpired, tooLongOf, usageLimitOf } from "./reply-problem"

const scrolling = matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"

const textOf = (message: ChatMessage) =>
  message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n")

function Action({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<MessageAction label={label} onClick={onClick} className="text-muted-foreground" />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Action
      label={copied ? "Copied" : "Copy"}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          },
          () => setCopied(false),
        )
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Action>
  )
}

const Ask = memo(function Ask({ message }: { message: ChatMessage }) {
  return (
    <Message from="user" className="max-w-[85%]">
      <MessageContent className="rounded-3xl px-4 py-2.5 text-base leading-7 whitespace-pre-wrap">
        {textOf(message)}
      </MessageContent>
    </Message>
  )
})

const Answer = memo(function Answer({
  message,
  streaming,
  stopped,
  onRetry,
}: {
  message: ChatMessage
  streaming: boolean
  stopped: boolean
  onRetry: (() => void) | undefined
}) {
  const text = textOf(message)
  return (
    <Message from="assistant" className="max-w-full">
      <MessageContent className="w-full text-base leading-7">
        {message.parts.map((part, index) => {
          if (part.type === "reasoning") {
            const thinking = streaming && part.state === "streaming"
            return (
              <details key={index} open={thinking || undefined} className="group/thought text-sm">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground">
                  {thinking ? "Thinking" : "Thought process"}
                  <ChevronRightIcon className="size-4 transition-transform group-open/thought:rotate-90 motion-reduce:transition-none" />
                </summary>
                <MessageResponse className="mt-2 border-l-2 pl-4 text-muted-foreground" isAnimating={thinking}>
                  {part.text}
                </MessageResponse>
              </details>
            )
          }
          if (part.type === "text") {
            return (
              <MessageResponse key={index} isAnimating={streaming}>
                {part.text}
              </MessageResponse>
            )
          }
          return null
        })}
      </MessageContent>
      {stopped ? (
        <p className="text-sm text-muted-foreground">
          Display paused. The reply continues on the server. Reopen this chat to see the full answer.
        </p>
      ) : message.metadata?.reply?.state === "stopped" ? (
        <p className="text-sm text-muted-foreground">Reply interrupted.</p>
      ) : null}
      {streaming ? null : (
        <MessageActions
          className={cn(
            "-ml-2",
            onRetry === undefined &&
              "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
          )}
        >
          {text === "" ? null : <CopyAction text={text} />}
          {onRetry === undefined ? null : (
            <Action label="Retry" onClick={onRetry}>
              <RotateCcwIcon />
            </Action>
          )}
        </MessageActions>
      )}
    </Message>
  )
})

function Note({
  tone,
  text,
  onRetry,
  onSignIn,
}: {
  tone: "problem" | "quiet"
  text: string
  onRetry: () => void
  onSignIn?: (() => void) | undefined
}) {
  return (
    <div
      role={tone === "problem" ? "alert" : undefined}
      tabIndex={tone === "problem" ? 0 : undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm",
        tone === "problem" ? "border-destructive/30 bg-destructive/5" : "text-muted-foreground",
      )}
    >
      {tone === "problem" ? <CircleAlertIcon className="size-4 shrink-0 text-destructive" /> : null}
      <span className="min-w-0 flex-1">{text}</span>
      {onSignIn ? (
        <Button variant="outline" size="sm" onClick={onSignIn}>
          <LogInIcon />
          Sign in
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcwIcon />
          Retry
        </Button>
      )}
    </div>
  )
}

export type ThreadProps = {
  messages: readonly ChatMessage[]
  status: ChatStatus
  error: Error | undefined
  stopped: ReadonlySet<string>
  onRetry: () => void
  onSignIn: (question: string, saved: boolean) => void
}

export default function Thread({ messages, status, error, stopped, onRetry, onSignIn }: ThreadProps) {
  const last = messages.at(-1)
  const limit = usageLimitOf(error)
  const question = messages.findLast((message) => message.role === "user")
  const signIn = () =>
    onSignIn(
      question ? textOf(question) : "",
      messages.some((message) => message.role === "assistant"),
    )
  return (
    <Conversation
      className="min-h-0"
      initial={scrolling}
      resize={scrolling}
      aria-label="Conversation"
      aria-busy={status === "submitted" || status === "streaming"}
    >
      <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 pt-6 pb-10">
        {messages.map((message) =>
          message.role === "user" ? (
            <Ask key={message.id} message={message} />
          ) : (
            <Answer
              key={message.id}
              message={message}
              streaming={status === "streaming" && message === last}
              stopped={stopped.has(message.id)}
              onRetry={
                status === "ready" &&
                error === undefined &&
                message.metadata?.reply?.state !== "failed" &&
                message === last
                  ? onRetry
                  : undefined
              }
            />
          ),
        )}
        {status === "submitted" ? (
          <span role="status" aria-label="Waiting for the reply" className="flex h-7 items-center">
            <span className="size-3 rounded-full bg-foreground motion-safe:animate-pulse" />
          </span>
        ) : null}
        {status === "ready" && last?.metadata?.reply?.state === "streaming" ? (
          <p role="status" className="text-sm text-muted-foreground">
            The reply is still running on the server. Reopen this chat after it finishes to see the full answer.
          </p>
        ) : null}
        {error !== undefined || status === "error" || last?.metadata?.reply?.state === "failed" ? (
          limit ? (
            <OverLimit resetsAt={limit.resetsAt} onRetry={onRetry} />
          ) : tooLongOf(error) ? (
            <TooLong />
          ) : (
            <Note
              tone="problem"
              text={problemOf(error)}
              onRetry={onRetry}
              onSignIn={sessionExpired(error) ? signIn : undefined}
            />
          )
        ) : null}
        {status === "ready" && last?.role === "user" && stopped.has(last.id) ? (
          <Note
            tone="quiet"
            text="Display paused. The reply continues on the server. Reopen this chat to see the full answer."
            onRetry={onRetry}
          />
        ) : null}
      </ConversationContent>
      <ConversationScrollButton aria-label="Jump to latest" />
    </Conversation>
  )
}
