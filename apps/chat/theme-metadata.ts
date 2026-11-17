import { readFileSync } from "node:fs"
import type { Plugin } from "vite"

export function themeMetadata(): Plugin {
  return {
    name: "theme-metadata",
    transformIndexHtml() {
      const tokens = readFileSync(new URL("./src/styles/tokens.css", import.meta.url), "utf8")
      const backgrounds = [...tokens.matchAll(/--background:\s*([^;]+);/g)].map((match) => (match[1] ?? "").trim())
      if (backgrounds.length !== 2 || backgrounds.some((color) => !color))
        throw new Error("Expected light and dark background tokens")
      return backgrounds.map((content, index) => ({
        tag: "meta",
        attrs: { name: "theme-color", media: `(prefers-color-scheme: ${index === 0 ? "light" : "dark"})`, content },
        injectTo: "head",
      }))
    },
  }
}
