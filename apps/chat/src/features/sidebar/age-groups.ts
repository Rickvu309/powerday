import type { Conversation } from "@powerday/chat-core"

export const ages = ["Today", "Yesterday", "Previous 7 days", "Older"] as const
export type Age = (typeof ages)[number]

export const groupByAge = (conversations: readonly Conversation[], now: Date) => {
  const daysAgo = (days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - days).getTime()
  const starts: readonly [Age, number][] = [
    ["Today", daysAgo(0)],
    ["Yesterday", daysAgo(1)],
    ["Previous 7 days", daysAgo(7)],
    ["Older", -Infinity],
  ]
  const ageOf = (conversation: Conversation) =>
    starts.find(([, start]) => conversation.updatedAt.getTime() >= start)![0]
  return ages
    .map((age) => ({ age, conversations: conversations.filter((conversation) => ageOf(conversation) === age) }))
    .filter((group) => group.conversations.length > 0)
}
