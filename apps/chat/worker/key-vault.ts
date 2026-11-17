import * as z from "zod"
import type { KeyVault } from "@powerday/chat-core"

export const keyVault = (secret: string | undefined): KeyVault => {
  const key = async () => {
    if (!secret || secret.length < 32) throw new Error("PROVIDER_KEYS_SECRET needs at least 32 characters")
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret))
    return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"])
  }
  return {
    seal: async (plain) => {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        await key(),
        new TextEncoder().encode(plain),
      )
      return JSON.stringify({ iv: [...iv], data: [...new Uint8Array(encrypted)] })
    },
    open: async (sealed) => {
      const { iv, data } = z
        .strictObject({
          iv: z.array(z.int().min(0).max(255)).length(12),
          data: z.array(z.int().min(0).max(255)).min(16).max(8192),
        })
        .parse(JSON.parse(sealed))
      return new TextDecoder().decode(
        await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, await key(), new Uint8Array(data)),
      )
    },
  }
}
