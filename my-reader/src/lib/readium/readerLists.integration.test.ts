import { expect, test } from "@playwright/test"

type ReaderListsTestWindow = Window & {
  mountReaderListsFixture: (kind: "bookmarks" | "annotations") => Promise<void>
  readerListEvents: string[]
}

for (const kind of ["bookmarks", "annotations"] as const) {
  test(`${kind} keep selection controls in a fixed footer and restore navigation after deletion`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 600 })
    await page.goto("/integration-frontend/readerLists.html")
    await page.evaluate(
      (kind) =>
        (window as unknown as ReaderListsTestWindow).mountReaderListsFixture(
          kind,
        ),
      kind,
    )
    const select = page.getByRole("button", { name: "Select", exact: true })
    const remove = page.getByRole("button", { name: /^Delete selected/ })
    const rows = page.locator("aside li button")
    await expect(select).toBeInViewport()
    await expect(remove).toHaveCount(0)
    const footerPosition = await select.boundingBox()
    await select.click()
    await expect(remove).toBeDisabled()
    await page.getByRole("button", { name: "Select all", exact: true }).click()
    await expect(
      page.locator('aside li button[aria-pressed="true"]'),
    ).toHaveCount(20)
    await page
      .getByRole("button", { name: "Deselect all", exact: true })
      .click()
    await expect(
      page.locator('aside li button[aria-pressed="true"]'),
    ).toHaveCount(0)
    await expect(remove).toBeDisabled()
    await rows.nth(0).click()
    await rows.nth(1).click()
    expect(
      await page.evaluate(
        () => (window as unknown as ReaderListsTestWindow).readerListEvents,
      ),
    ).toEqual([])
    await expect(remove).toBeEnabled()
    const deletePosition = await remove.boundingBox()
    expect(deletePosition!.x).toBeGreaterThan(footerPosition!.x)
    const deselect = page.getByRole("button", {
      name: "Deselect",
      exact: true,
    })
    await page
      .locator("aside .myreader-overlay-viewport")
      .evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
    await expect(rows.last()).toBeInViewport()
    await expect(remove).toBeInViewport()
    expect(await deselect.boundingBox()).toEqual(footerPosition)
    expect(await remove.boundingBox()).toEqual(deletePosition)
    await remove.click()
    await expect(rows).toHaveCount(18)
    await expect(remove).toHaveCount(0)
    await expect(select).toHaveAttribute("aria-pressed", "false")
    await rows.first().click()
    expect(
      await page.evaluate(
        () => (window as unknown as ReaderListsTestWindow).readerListEvents,
      ),
    ).toEqual(["delete:item-1", "delete:item-2", "open:item-3"])
  })
}
