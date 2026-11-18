import { readFileSync } from "node:fs"
import type { Plugin } from "vite"

export function themeMetadata(): Plugin {
  return {
    name: "theme-metadata",
    transformIndexHtml() {
      const tokens = readFileSync(new URL("./src/styles/tokens.css", import.meta.url), "utf8")
      const background = tokens.match(/--background:\s*([^;]+);/)?.[1]?.trim()
      if (!background) throw new Error("Expected a background token")
      return [{ tag: "meta", attrs: { name: "theme-color", content: background }, injectTo: "head" }]
    },
  }
}
