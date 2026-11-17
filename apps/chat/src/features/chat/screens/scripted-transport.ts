import type { ChatMessage } from "@powerday/chat-core"
import type { ChatTransport, UIMessageChunk } from "ai"
import { ReplyProblem } from "../reply-problem"

export type Script =
  | { readonly kind: "reply"; readonly text: string; readonly reasoning?: string; readonly holdAfter?: number }
  | { readonly kind: "fail"; readonly status: number; readonly resetsAt?: Date }

const tokensPerTick = 8
const tickMs = 16

export const tokensOf = (text: string) => text.match(/\s*\S+/g) ?? []

const chunksOf = ({ text, reasoning }: { text: string; reasoning?: string }) => {
  const thought =
    reasoning === undefined
      ? []
      : [
          { type: "reasoning-start", id: "thought" } as const,
          ...tokensOf(reasoning).map((delta) => ({ type: "reasoning-delta", id: "thought", delta }) as const),
          { type: "reasoning-end", id: "thought" } as const,
        ]
  const opening: UIMessageChunk[] = [{ type: "start" }, ...thought, { type: "text-start", id: "reply" }]
  const deltas: UIMessageChunk[] = tokensOf(text).map((delta) => ({ type: "text-delta", id: "reply", delta }))
  const closing: UIMessageChunk[] = [{ type: "text-end", id: "reply" }, { type: "finish" }]
  return { opening, deltas, closing }
}

const paced = (script: Extract<Script, { kind: "reply" }>, signal: AbortSignal | undefined) => {
  const { opening, deltas, closing } = chunksOf(script)
  const hold = script.holdAfter ?? Number.POSITIVE_INFINITY
  let timer: ReturnType<typeof setInterval> | undefined
  const halt = () => clearInterval(timer)
  return new ReadableStream<UIMessageChunk>({
    start: (controller) => {
      signal?.addEventListener(
        "abort",
        () => {
          halt()
          controller.close()
        },
        { once: true },
      )
      for (const chunk of opening) controller.enqueue(chunk)
      let sent = 0
      timer = setInterval(() => {
        const end = Math.min(sent + tokensPerTick, deltas.length, hold)
        for (const delta of deltas.slice(sent, end)) controller.enqueue(delta)
        sent = end
        if (sent === hold) return halt()
        if (sent < deltas.length) return
        halt()
        for (const chunk of closing) controller.enqueue(chunk)
        performance.mark("fake-reply-complete", { detail: deltas.length })
        controller.close()
      }, tickMs)
    },
    cancel: halt,
  })
}

export const scriptedTransport = (script: Script): ChatTransport<ChatMessage> => ({
  sendMessages: async ({ abortSignal }) => {
    if (script.kind === "reply") return paced(script, abortSignal)
    throw new ReplyProblem(script.status, script.resetsAt)
  },
  reconnectToStream: async () => null,
})
