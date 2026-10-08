import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@my-reader\/fonts$/,
        replacement: path.resolve(__dirname, "./src/index.ts"),
      },
      {
        find: /^@my-reader\/fonts\/(.+)$/,
        replacement: path.resolve(__dirname, "./src/$1"),
      },
    ],
  },
  test: {
    include: [path.resolve(__dirname, "tests/**/*.test.ts")],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/index.ts"],
      reporter: ["text-summary", "json-summary", "html", "lcov"],
      thresholds: { lines: 96, statements: 91, functions: 87, branches: 75 },
    },
  },
})
