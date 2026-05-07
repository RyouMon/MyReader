import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^my-reader-tools\/(.+)$/,
        replacement: path.resolve(__dirname, "./src/$1"),
      },
    ],
  },
  test: {
    environment: "jsdom",
    include: [path.resolve(__dirname, "tests/**/*.test.ts")],
    reporters: ["default"],
  },
})
