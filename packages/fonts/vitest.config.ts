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
  },
})
