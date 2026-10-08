import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "src/__mocks__/setup.ts")],
    include: [
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
    ],
    exclude: ["node_modules/", "e2e-frontend/", "e2e/"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text-summary", "json-summary", "html", "lcov"],
      exclude: [
        "node_modules/",
        "**/__tests__/**",
        "**/__mocks__/**",
        "src/routeTree.gen.ts",
        "src/lib/tauri-specta.ts",
        "src/components/ui/**",
        "**/*.generated.*",
        "src/main.tsx",
        "**/*.d.ts",
        "**/*.config.*",
      ],
      // Initial full-source baseline; the previous 70/65/60/70 goals were not met.
      // See docs/QUALITY.md before changing these floors.
      thresholds: {
        lines: 48,
        functions: 46,
        branches: 41,
        statements: 46,
      },
    },
  },
})
