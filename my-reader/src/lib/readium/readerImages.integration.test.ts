import { expect, test } from "@playwright/test"

type ImageTestWindow = Window & {
  readerImageShares: string[][]
  readerImageActions: { action: string; name: string; data: string }[]
  mountReaderImagesFixture: () => Promise<string[]>
}

test("CBZ shares the visible spread and saves the clicked original with book metadata", async ({
  page,
}) => {
  await page.goto("/integration-frontend/readerImages.html")
  const originals = await page.evaluate(async () => {
    return (window as unknown as ImageTestWindow).mountReaderImagesFixture()
  })
  const share = async () => {
    await page.mouse.move(600, 10)
    await page.getByRole("button", { name: "More", exact: true }).click()
    await page.getByRole("menuitem", { name: "Share", exact: true }).click()
  }
  await expect(
    page.locator('[data-fixed-layout-spread="0"]'),
  ).not.toHaveAttribute("aria-hidden", "true")
  await share()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as ImageTestWindow).readerImageShares,
      ),
    )
    .toEqual([["/cache/张三-山海-1.png"]])
  await page.keyboard.press("ArrowRight")
  await expect(
    page.locator('[data-fixed-layout-spread="1"]'),
  ).not.toHaveAttribute("aria-hidden", "true")
  await share()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as ImageTestWindow).readerImageShares,
      ),
    )
    .toEqual([
      ["/cache/张三-山海-1.png"],
      ["/cache/张三-山海-2.png", "/cache/张三-山海-3.png"],
    ])
  await page.locator('img[data-reader-page="3"]').click({ button: "right" })
  await page.getByRole("menuitem", { name: "Save image…", exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as ImageTestWindow).readerImageActions,
      ),
    )
    .toEqual([
      { action: "prepareShare", name: "张三-山海-1.png", data: originals[0] },
      { action: "prepareShare", name: "张三-山海-2.png", data: originals[1] },
      { action: "prepareShare", name: "张三-山海-3.png", data: originals[2] },
      { action: "save", name: "张三-山海-3.png", data: originals[2] },
    ])
})
