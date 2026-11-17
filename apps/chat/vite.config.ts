import path from "node:path"
import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { themeMetadata } from "./theme-metadata.js"

export default defineConfig({
  plugins: [
    themeMetadata(),
    react(),
    tailwindcss(),
    cloudflare({
      config: () => ({
        vars: { LOCAL_AUTH: process.env.POWERDAY_LOCAL_AUTH === "1" ? "true" : "false" },
      }),
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
})
