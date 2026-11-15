import * as z from "zod"

export const UserId = z.string().min(1).max(128).brand("UserId")
export type UserId = z.infer<typeof UserId>

export const ConversationId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/)
  .brand("ConversationId")
export type ConversationId = z.infer<typeof ConversationId>

export type Ids = {
  readonly conversation: () => ConversationId
  readonly message: () => string
}
