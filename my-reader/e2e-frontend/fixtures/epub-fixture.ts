import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Page } from "@playwright/test"

const directory = fileURLToPath(
  new URL("../../../my-reader-mobile/e2e/fixtures/tts-book", import.meta.url),
)
const fixtureUrl = "http://localhost:1420/__e2e/tts-book"

// Serve the actual publication independently of Vite's development-only /@fs.
export async function serveEpubFixture(page: Page): Promise<string> {
  await page.route(`${fixtureUrl}/**`, async (route) => {
    const relativePath = decodeURIComponent(
      new URL(route.request().url()).pathname.slice("/__e2e/tts-book/".length),
    )
    await route.fulfill({ path: join(directory, relativePath) })
  })
  return fixtureUrl
}
