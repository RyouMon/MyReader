import { test as base } from "playwright-bdd"
import { injectTauriInternals } from "./tauri-browser-mock"

export const test = base.extend({
  context: async ({ browser }, use) => {
    const context = await browser.newContext()
    await injectTauriInternals(context)
    await use(context)
    await context.close()
  },
})
