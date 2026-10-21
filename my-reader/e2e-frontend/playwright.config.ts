import { defineConfig, devices } from "@playwright/test"
import { defineBddConfig } from "playwright-bdd"

const testDir = defineBddConfig({
  features: "./features/**/*.feature",
  steps: [
    "./step-definitions/**/*.ts",
    "./fixtures/test.ts",
    "./fixtures/reader-tts.ts",
  ],
})

const projects = [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ...(process.platform === "darwin"
    ? [{ name: "webkit", use: { ...devices["Desktop Safari"] } }]
    : []),
]

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "reports/report.json" }],
  ],
  use: {
    locale: "zh-CN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    baseURL: "http://localhost:1420",
  },
  projects,
  webServer: {
    command: process.env.E2E_PREVIEW
      ? "pnpm run preview --host 127.0.0.1 --port 1420 --strictPort"
      : "pnpm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    cwd: "..",
  },
})
