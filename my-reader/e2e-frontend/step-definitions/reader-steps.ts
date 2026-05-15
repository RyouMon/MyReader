import { expect } from "@playwright/test"
import { createBdd } from "playwright-bdd"
import { setupLibraryMocks } from "../fixtures/library-mock"
import { setupReaderMocks } from "../fixtures/reader-mock"
import { test } from "../fixtures/test"
import { ReaderPage } from "../pages/ReaderPage"

const { Given, When, Then } = createBdd(test)

Given("用户已选择书库", async ({ page }) => {
  await setupLibraryMocks(page, 10)
})

Given("书库中存在一本可读的 EPUB 书籍", async ({ page }) => {
  await setupLibraryMocks(page, 10)
  await setupReaderMocks(page, { bookId: 1, format: "EPUB" })
})

Given("书籍内容源在 {int} 秒内未能就绪", async ({ page }, _: number) => {
  await setupReaderMocks(page, {
    bookId: 1,
    format: "EPUB",
    hangPrepareBookSource: true,
  })
})

When("用户打开该书进行阅读", async ({ page }) => {
  const readerPage = new ReaderPage(page)
  await readerPage.goto(1, "EPUB")
})

Then("阅读器应显示{string}", async ({ page }, text: string) => {
  const readerPage = new ReaderPage(page)
  await expect(readerPage.getInitialLoading()).toContainText(text)
})

Then(
  "阅读器应在 {int} 秒内显示加载失败提示",
  async ({ page }, timeout: number) => {
    const readerPage = new ReaderPage(page)
    await readerPage.waitForError(timeout * 1000)
  },
)

Then("阅读器不再显示{string}", async ({ page }, text: string) => {
  const readerPage = new ReaderPage(page)
  await expect(
    page.locator("role=status").filter({ hasText: text }),
  ).not.toBeVisible()
})

Then(
  "阅读器应在 {int} 秒内离开初始加载状态",
  async ({ page }, timeout: number) => {
    const readerPage = new ReaderPage(page)
    await readerPage.waitForInitialLoadingToDisappear(timeout * 1000)
  },
)

Then("阅读器不再显示加载状态", async ({ page }) => {
  const readerPage = new ReaderPage(page)
  await expect(readerPage.getInitialLoading()).not.toBeVisible()
})
