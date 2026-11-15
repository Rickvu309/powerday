import { ConversationId, ModelId, UserId, type Conversation } from "@powerday/chat-core"
import { expect, it } from "vitest"
import { groupByAge } from "./age-groups"

const at = (id: string, updatedAt: Date): Conversation => ({
  id: ConversationId.parse(id),
  owner: UserId.parse("ada"),
  title: id,
  model: ModelId.parse("mock"),
  createdAt: updatedAt,
  updatedAt,
})

it("groups chats into Today, Yesterday, Previous 7 days and Older by local calendar day", () => {
  const now = new Date(2026, 10, 15, 9, 30)
  const chats = [
    at("this-morning", new Date(2026, 10, 15, 0, 1)),
    at("last-night", new Date(2026, 10, 14, 23, 59)),
    at("monday", new Date(2026, 10, 9, 12)),
    at("eight-days", new Date(2026, 10, 7, 23, 59)),
  ]
  expect(groupByAge(chats, now).map(({ age, conversations }) => [age, conversations.map((each) => each.id)])).toEqual([
    ["Today", ["this-morning"]],
    ["Yesterday", ["last-night"]],
    ["Previous 7 days", ["monday"]],
    ["Older", ["eight-days"]],
  ])
})

it("leaves out an age with no chats", () => {
  expect(groupByAge([at("old", new Date(2020, 0, 1))], new Date(2026, 10, 15)).map((group) => group.age)).toEqual([
    "Older",
  ])
})
