import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@my-reader\/tools\/(.+)$/,
        replacement: path.resolve(__dirname, "./src/$1"),
      },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/types/**"],
      reporter: ["text-summary", "json-summary", "html", "lcov"],
      thresholds: { lines: 87, statements: 84, functions: 90, branches: 72 },
    },
  },
})
