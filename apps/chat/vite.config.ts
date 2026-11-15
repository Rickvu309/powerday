import path from "node:path"
import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
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
