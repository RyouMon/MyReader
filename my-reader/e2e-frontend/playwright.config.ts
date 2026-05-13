import { defineConfig, devices } from "@playwright/test"
import { defineBddConfig } from "playwright-bdd"

const testDir = defineBddConfig({
  features: "./features/**/*.feature",
  steps: "./step-definitions/**/*.ts",
})

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "reports/report.json" }],
  ],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    baseURL: "http://localhost:1420",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    cwd: "..",
    timeout: 120000,
  },
})
