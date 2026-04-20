import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "tests/setup.ts")],
    include: ["tests/**/*.test.ts"],
    reporters: ["default"],
  },
})
