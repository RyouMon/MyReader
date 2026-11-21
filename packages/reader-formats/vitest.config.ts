import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,js}"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text-summary", "lcov"],
    },
  },
})
