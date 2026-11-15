import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["{apps,packages}/*/{src,worker}/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
    retry: 0,
  },
})
