import { test as base } from "playwright-bdd"
import { injectTauriInternals } from "./tauri-browser-mock"

export const test = base.extend({
  context: async ({ context }, use) => {
    await injectTauriInternals(context)
    await use(context)
  },
})
