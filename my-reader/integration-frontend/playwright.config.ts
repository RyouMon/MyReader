import { defineConfig, devices } from "@playwright/test"

const projects = [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ...(process.platform === "darwin"
    ? [{ name: "webkit", use: { ...devices["Desktop Safari"] } }]
    : []),
]

export default defineConfig({
  testDir: "../src",
  testMatch: "**/*.integration.test.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["json", { outputFile: "reports/integration.json" }]],
  use: {
    baseURL: "http://localhost:1420",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects,
  webServer: {
    command: "pnpm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    cwd: "..",
  },
})
