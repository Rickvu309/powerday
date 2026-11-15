import * as auth from "./routes/auth.js"
import * as chat from "./routes/chat.js"
import * as conversation from "./routes/conversation.js"
import * as conversations from "./routes/conversations.js"
import * as models from "./routes/models.js"

export const routes = {
  chat: { method: "POST", path: "/api/chat", read: chat.read },
  models: { method: "GET", path: "/api/models", read: models.read },
  conversations: { method: "GET", path: "/api/conversations", read: conversations.read },
  conversation: { method: "GET", path: "/api/conversations/:id", read: conversation.read },
  rename: { method: "PATCH", path: "/api/conversations/:id", read: conversation.readRename },
  delete: { method: "DELETE", path: "/api/conversations/:id", read: conversation.read },
  auth: { method: "ALL", path: "/api/auth/*", read: auth.read },
} as const

export type { ChatRequest } from "./routes/chat.js"
