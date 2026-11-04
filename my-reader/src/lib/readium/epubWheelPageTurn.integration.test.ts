import { expect, test } from "@playwright/test"
import { setupDesktopTtsMocks } from "../../../e2e-frontend/fixtures/desktop-tts-mock"
import { setupLibraryMocks } from "../../../e2e-frontend/fixtures/library-mock"
import { injectTauriInternals } from "../../../e2e-frontend/fixtures/tauri-browser-mock"
import { DesktopTtsReaderPage } from "../../../e2e-frontend/pages/DesktopTtsReaderPage"

for (const width of [700, 1280]) {
  test(`EPUB wheel turns forward and backward across chapters at width ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await injectTauriInternals(page)
    await setupLibraryMocks(page, 1)
    await setupDesktopTtsMocks(page)
    const reader = new DesktopTtsReaderPage(page)
    await reader.goto()
    await reader.goToChapter("Page turn target")
    const initialText = await reader.visibleReaderText()

    await page.mouse.move(width / 2, 400)
    await page.mouse.wheel(0, 120)
    await reader.waitForVisibleText("Progress jump target")
    expect(await reader.visibleReaderText()).not.toBe(initialText)

    // The reverse turn is a new gesture, after wheel inertia has ended.
    await page.waitForTimeout(250)
    await page.mouse.wheel(0, -120)
    await reader.waitForVisibleText("Page turn target")
    expect(await reader.visibleReaderText()).toBe(initialText)
  })
}
