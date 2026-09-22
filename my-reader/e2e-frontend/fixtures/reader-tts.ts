import { DesktopTtsReaderPage } from "../pages/DesktopTtsReaderPage"
import { setupDesktopTtsMocks } from "./desktop-tts-mock"
import { setupLibraryMocks } from "./library-mock"
import { test as base } from "./test"

type TtsContext = {
  initialText: string | null
  initialCount: number
  concurrentNavigation?: {
    detachedBeforeCompletion: boolean
    finished: boolean
  }
}

export const test = base.extend<{
  ttsReader: DesktopTtsReaderPage
  ttsContext: TtsContext
}>({
  ttsReader: async ({ page }, use) => {
    await setupLibraryMocks(page, 1)
    await setupDesktopTtsMocks(page)
    await use(new DesktopTtsReaderPage(page))
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture dependencies.
  ttsContext: async ({}, use) => {
    await use({ initialText: null, initialCount: 0 })
  },
})
