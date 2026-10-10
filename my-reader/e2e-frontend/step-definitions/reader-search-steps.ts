import { expect, type Page } from "@playwright/test"
import { createBdd } from "playwright-bdd"
import { test } from "../fixtures/reader-tts"

const { When, Then } = createBdd(test)

function searchPanel(page: Page) {
  return page.locator("aside").filter({ has: page.getByRole("searchbox") })
}

When("小文在书内搜索 {string}", async ({ page, ttsReader }, query: string) => {
  await ttsReader.revealBottomChrome()
  await page.getByRole("button", { name: "搜索", exact: true }).click()
  const searchbox = page.getByRole("searchbox", { name: "搜索本书内容" })
  await searchbox.fill(query)
  await searchbox.press("Enter")
  await expect
    .poll(() => searchPanel(page).locator("ol button").count())
    .toBeGreaterThan(1)
})

When(
  "小文选择搜索结果 {string}",
  async ({ page, ttsReader }, title: string) => {
    await searchPanel(page)
      .locator("ol button")
      .filter({ hasText: title })
      .first()
      .click()
    await ttsReader.waitForVisibleText(title)
  },
)

Then(
  "搜索面板保留 {string} 的结果并选中 {string}",
  async ({ page }, query: string, title: string) => {
    const panel = searchPanel(page)
    await expect(panel).toHaveAttribute("data-visible", "true")
    await expect(panel.getByRole("searchbox")).toHaveValue(query)
    await expect(
      panel.locator("ol button").filter({ hasText: title }).first(),
    ).toHaveAttribute("aria-pressed", "true")
    await expect
      .poll(() => panel.locator("ol button").count())
      .toBeGreaterThan(1)
  },
)

When("小文关闭搜索面板", async ({ page }) => {
  await page.getByRole("button", { name: "搜索", exact: true }).click()
})

Then("搜索面板已关闭", async ({ page }) => {
  await expect(searchPanel(page)).toHaveAttribute("data-visible", "false")
})
