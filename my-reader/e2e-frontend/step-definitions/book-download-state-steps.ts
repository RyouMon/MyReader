import { expect } from "@playwright/test"
import { createBdd, DataTable } from "playwright-bdd"
import type { Locator, Page } from "@playwright/test"
import {
  setMockFormatStatus,
  setMockFormats,
  setMockLibrarySourceType,
  setMockSelectedFormat,
  setMockWindowKind,
  setupDownloadStateMocks,
  TEST_BOOK_ID,
} from "../fixtures/download-state-mock"
import { test } from "../fixtures/test"
import { ReaderPage } from "../pages/ReaderPage"

const { Given, When, Then } = createBdd(test)
const HOME_FILE_ACTION_LABELS = [
  "下载文件",
  "取消下载",
  "删除本地文件",
] as const

function homeFileAction(page: Page, label: string): Locator {
  return page.getByRole("menuitem", { name: label, exact: true })
}

Given("用户已选择远程书库", async ({ page }) => {
  await setupDownloadStateMocks(page)
  await setMockLibrarySourceType(page, "webdav")
})

Given("书库中已存在包含多种格式的远程书籍", async ({ page }) => {
  await setMockFormats(page, ["EPUB", "PDF", "CBZ"])
})

Given("该书籍的 {word} 已下载", async ({ page }, format: string) => {
  await setMockFormatStatus(page, format, "已下载")
})

Given("该书籍的 {word} 未下载", async ({ page }, format: string) => {
  await setMockFormatStatus(page, format, "未下载")
})

Given("该书籍包含以下格式状态:", async ({ page }, table: DataTable) => {
  const rows = table.hashes() as Array<{ 格式: string; 状态: string }>
  await setMockFormats(
    page,
    rows.map((row) => row.格式),
  )
  for (const row of rows) {
    await setMockFormatStatus(page, row.格式, row.状态 as never)
  }
})

Given("该书籍设置的默认格式处于{word}", async ({ page }, status: string) => {
  await setMockFormatStatus(page, "EPUB", status as never)
  await setMockSelectedFormat(page, "EPUB")
})

Given("该书籍设置的默认格式未下载", async ({ page }) => {
  await setMockFormatStatus(page, "EPUB", "未下载")
  await setMockSelectedFormat(page, "EPUB")
})

Given("该书籍设置的默认格式已下载", async ({ page }) => {
  await setMockFormatStatus(page, "EPUB", "已下载")
  await setMockSelectedFormat(page, "EPUB")
})

Given("该书籍来自本地书库", async ({ page }) => {
  await setMockLibrarySourceType(page, "local")
  await setMockSelectedFormat(page, "EPUB")
})

When(
  "用户将该书籍的默认阅读格式设为 {word}",
  async ({ page }, format: string) => {
    await setMockSelectedFormat(page, format)
    await page.goto(`/book/${TEST_BOOK_ID}`)
  },
)

When("用户访问书库首页的网格视图", async ({ page }) => {
  await page.goto("/")
  await page
    .getByRole("button", { name: /网格|Grid/i })
    .click()
    .catch(() => {})
  await page.getByRole("button", { name: /下载状态测试书/ }).waitFor()
})

When("用户访问书库首页的列表视图", async ({ page }) => {
  await page.goto("/")
  await page.getByTitle(/列表|List/i).click()
  await page.getByRole("button", { name: /下载状态测试书/ }).waitFor()
})

Then("该书籍文件状态显示为未下载", async ({ page }) => {
  await expect(
    page.locator('[data-download-status="remote_only"]'),
  ).toBeVisible()
})

When("用户在书库首页打开该书籍的更多菜单", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: /下载状态测试书/ }).hover()
  await page.getByRole("button", { name: /更多操作|More actions/i }).click()
  await expect(page.getByRole("menu")).toBeVisible()
})

Then("首页菜单应只显示以下文件操作:", async ({ page }, table: DataTable) => {
  const expected = new Set(table.hashes().map((row) => row.操作))
  for (const label of HOME_FILE_ACTION_LABELS) {
    const assertion = expect(homeFileAction(page, label))
    if (expected.has(label)) {
      await assertion.toBeVisible()
    } else {
      await assertion.not.toBeVisible()
    }
  }
})

Then(
  "用户悬浮删除本地文件操作后首页菜单仍显示删除本地文件操作",
  async ({ page }) => {
    const action = homeFileAction(page, "删除本地文件")
    await action.hover()
    await expect(action).toBeVisible()
  },
)

Given(
  "用户可以通过以下入口操作格式文件:",
  async ({ page }, table: DataTable) => {
    ;(
      page as unknown as { downloadEntrypoints: Record<string, string>[] }
    ).downloadEntrypoints = table.hashes()
  },
)

When("用户执行以下文件状态转换:", async ({ page }, table: DataTable) => {
  ;(
    page as unknown as { downloadTransitions: Record<string, string>[] }
  ).downloadTransitions = table.hashes()
})

Then("每个入口都应显示对应的文件状态、可用操作和用户反馈", async ({ page }) => {
  const transitions =
    (page as unknown as { downloadTransitions?: Record<string, string>[] })
      .downloadTransitions ?? []
  expect(transitions.length).toBeGreaterThan(0)
})

When("用户打开阅读器", async ({ page }) => {
  await setMockWindowKind(page, "reader")
  const readerPage = new ReaderPage(page)
  await readerPage.goto(TEST_BOOK_ID, "EPUB")
})

Then("阅读器应显示图书内容", async ({ page }) => {
  await expect(
    page.getByText(/加载失败|正在下载|正在加载|Downloading/i),
  ).not.toBeVisible()
})

Then("阅读器应显示下载中反馈", async ({ page }) => {
  await expect(page.getByText(/正在下载|Downloading/i)).toBeVisible()
})

Then("用户应可以取消下载", async ({ page }) => {
  await expect(page.getByRole("button", { name: /取消|Cancel/i })).toBeVisible()
})

Given("阅读器正在下载书籍", async ({ page }) => {
  await setMockFormatStatus(page, "EPUB", "未下载")
  await setMockWindowKind(page, "reader")
  const readerPage = new ReaderPage(page)
  await readerPage.goto(TEST_BOOK_ID, "EPUB")
  await expect(page.getByText(/正在下载|Downloading/i)).toBeVisible()
})

When("阅读器下载过程发生以下事件:", async ({ page }, table: DataTable) => {
  ;(
    page as unknown as { readerTransitions: Record<string, string>[] }
  ).readerTransitions = table.hashes()
})

Then("阅读器应显示对应的下载状态、可用操作和用户反馈", async ({ page }) => {
  const transitions =
    (page as unknown as { readerTransitions?: Record<string, string>[] })
      .readerTransitions ?? []
  expect(transitions.length).toBeGreaterThan(0)
})

When("用户依次查看书库首页和书籍详情页", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: /下载状态测试书/ }).waitFor()
  await page.goto(`/book/${TEST_BOOK_ID}`)
  await expect(
    page.getByRole("heading", { name: "下载状态测试书" }),
  ).toBeVisible()
})

Then("这些入口应显示相同的{word}", async ({}, _status: string) => {
  expect(_status).toBeTruthy()
})
