import { expect, test } from "@playwright/test"

test("bookmarks stay on the visible page when its center contains only whitespace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 })
  await page.goto("/")
  await page.setContent(`
    <style>
      html { height: 100%; }
      body {
        margin: 0; height: 100%; column-width: 800px;
        column-gap: 0; column-fill: auto;
      }
      p { font: 24px sans-serif; margin: 32px; }
      .page { break-before: column; }
    </style>
    <p id="first">First page.</p>
    <p id="second" class="page">Current page.</p>
    <p id="third" class="page">Next page.</p>
  `)

  const captured = await page.evaluate(async () => {
    const modulePath = "/src/lib/readium/generatedReaderViewportAnchor.ts"
    const { captureReaderViewportAnchor, isReaderViewportAnchorVisible } =
      await import(modulePath)
    window.scrollTo(window.innerWidth, 0)
    const anchor = captureReaderViewportAnchor(window)
    return {
      scrollX: window.scrollX,
      selector: anchor?.cssSelector,
      visible: anchor
        ? isReaderViewportAnchorVisible(window, anchor.domRange)
        : false,
    }
  })

  expect(captured.scrollX).toBeGreaterThan(0)
  expect(captured.selector).toBe("#second")
  expect(captured.visible).toBe(true)
})
