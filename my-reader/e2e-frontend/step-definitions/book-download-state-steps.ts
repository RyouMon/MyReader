import { expect } from "@playwright/test"
import { createBdd, DataTable } from "playwright-bdd"
import type { Locator, Page } from "@playwright/test"
import {
  emitMockDownloadStatus,
  replayMockDownloadProgress,
  mockDownloadCommands,
  type FileStatus,
  setMockFormatStatus,
  setMockFormats,
  setMockLibrarySourceType,
  setMockSelectedFormat,
  setMockWindowKind,
  setupDownloadStateMocks,
  TEST_BOOK_ID,
} from "../fixtures/download-state-mock"
import { test } from "../fixtures/test"
import { TEST_LIBRARY_ID } from "../fixtures/library-mock"
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

async function openHomeBookContextMenu(page: Page) {
  await page.goto("/")
  await page
    .getByRole("button", { name: /下载状态测试书/ })
    .click({ button: "right" })
  await expect(page.getByRole("menu")).toBeVisible()
}

Given("用户已选择远程书库", async ({ page }) => {
  await setupDownloadStateMocks(page)
  await setMockLibrarySourceType(page, "webdav")
})

Given("书库中已存在包含多种格式的远程书籍", async ({ page }) => {
  await setMockFormats(page, ["EPUB", "PDF", "CBZ"])
})

Given(
  "书库中已存在只包含 {word} 格式的远程书籍",
  async ({ page }, format: string) => {
    await setMockFormats(page, [format])
    await setMockSelectedFormat(page, format)
  },
)

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
    await setMockFormatStatus(page, row.格式, row.状态 as FileStatus)
  }
})

Given("该书籍设置的默认格式处于{word}", async ({ page }, status: string) => {
  await setMockFormatStatus(page, "EPUB", status as FileStatus)
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
    await expect(
      page.getByRole("switch", { name: `将 ${format} 设为默认阅读格式` }),
    ).toBeChecked()
  },
)

When("用户访问书库首页的网格视图", async ({ page }) => {
  await page.goto("/")
  await page.getByTitle(/网格|Grid/i).click()
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

When("用户在书库首页打开该书籍的上下文菜单", async ({ page }) => {
  await openHomeBookContextMenu(page)
})

When(
  "用户在书库首页将该书籍默认阅读格式设为 {word}",
  async ({ page }, format: string) => {
    await openHomeBookContextMenu(page)
    await page.getByRole("menuitem", { name: "默认阅读格式" }).click()
    await page.getByRole("menuitem", { name: format }).click()
  },
)

Then("默认阅读格式操作不显示", async ({ page }) => {
  await expect(
    page.getByRole("menuitem", { name: "默认阅读格式" }),
  ).not.toBeVisible()
})

Then(
  "首页上下文菜单应只显示以下文件操作:",
  async ({ page }, table: DataTable) => {
    const expected = new Set(table.hashes().map((row) => row.操作))
    for (const label of HOME_FILE_ACTION_LABELS) {
      const assertion = expect(homeFileAction(page, label))
      if (expected.has(label)) {
        await assertion.toBeVisible()
      } else {
        await assertion.not.toBeVisible()
      }
    }
  },
)

Then(
  "用户悬浮删除本地文件操作后首页上下文菜单仍显示删除本地文件操作",
  async ({ page }) => {
    const action = homeFileAction(page, "删除本地文件")
    await action.hover()
    await expect(action).toBeVisible()
  },
)

const fileEntrypoints = new WeakMap<Page, string>()

function formatRow(page: Page) {
  return page.getByRole("row").filter({
    has: page.getByRole("switch", { name: "将 EPUB 设为默认阅读格式" }),
  })
}

async function showFileMenu(page: Page) {
  if (await page.getByRole("menu").first().isVisible()) return
  await page
    .getByRole("button", { name: /下载状态测试书/ })
    .click({ button: "right" })
  await expect(page.getByRole("menu")).toBeVisible()
}

function fileAction(page: Page, label: string) {
  return fileEntrypoints.get(page) === "书籍详情页"
    ? formatRow(page).getByRole("button", { name: label, exact: true })
    : homeFileAction(page, label)
}

async function expectFileActions(page: Page, status: string) {
  const label =
    (
      {
        准备下载: "取消下载",
        下载中: "取消下载",
        已下载: "删除本地文件",
      } as Record<string, string>
    )[status] ?? "下载文件"
  if (fileEntrypoints.get(page) !== "书籍详情页") await showFileMenu(page)
  await expect(fileAction(page, label)).toBeEnabled()
  for (const action of HOME_FILE_ACTION_LABELS) {
    const item = fileAction(page, action)
    if (
      (await item.count()) > 0 &&
      (await item.getAttribute("aria-haspopup")) === "menu"
    ) {
      await item.focus()
      await item.press("ArrowRight")
      const format = page.getByRole("menuitem", { name: "EPUB", exact: true })
      if (action === label) await expect(format).toBeEnabled()
      else await expect(format).toHaveCount(0)
      await page.keyboard.press("ArrowLeft")
    } else if (action === label) {
      await expect(item).toBeEnabled()
    } else {
      await expect(item).toHaveCount(0)
    }
  }
}

async function expectCommand(page: Page, command: string) {
  await expect
    .poll(() => mockDownloadCommands(page))
    .toContainEqual({
      command,
      args: {
        libraryId: TEST_LIBRARY_ID,
        bookId: TEST_BOOK_ID,
        format: "EPUB",
      },
    })
}

async function clickFileAction(page: Page, label: string, command: string) {
  if (fileEntrypoints.get(page) !== "书籍详情页") await showFileMenu(page)
  const item = fileAction(page, label)
  const submenu = (await item.getAttribute("aria-haspopup")) === "menu"
  await item.click()
  if (submenu)
    await page.getByRole("menuitem", { name: "EPUB", exact: true }).click()
  await expectCommand(page, command)
}

Given(
  "用户在{word}操作{word}书籍的{word}文件",
  async ({ page }, entry: string, formats: string, status: FileStatus) => {
    fileEntrypoints.set(page, entry)
    await setMockFormats(
      page,
      formats === "单格式" ? ["EPUB"] : ["EPUB", "PDF", "CBZ"],
    )
    await setMockFormatStatus(
      page,
      "EPUB",
      status === "准备下载" ? "未下载" : status,
    )
    if (entry === "书籍详情页") {
      await page.goto(`/book/${TEST_BOOK_ID}`)
      await expect(formatRow(page)).toBeVisible()
    } else {
      await openHomeBookContextMenu(page)
    }
    await replayMockDownloadProgress(page)
    if (status === "准备下载") {
      await page.evaluate(() => window.__DOWNLOAD_STATE_MOCK__.holdStart())
      await clickFileAction(page, "下载文件", "download_book_file")
    }
    await expectFileActions(page, status)
  },
)

When("文件发生{word}", async ({ page }, event: string) => {
  const events: Record<string, () => Promise<void>> = {
    用户下载该格式文件: () =>
      clickFileAction(page, "下载文件", "download_book_file"),
    用户重新下载该格式文件: () =>
      clickFileAction(page, "下载文件", "download_book_file"),
    下载任务开始传输: () => emitMockDownloadStatus(page, "下载中"),
    下载任务启动失败: async () => {
      await page.evaluate(() => window.__DOWNLOAD_STATE_MOCK__.rejectStart())
      await expect(page.getByText("下载失败", { exact: true })).toBeVisible()
      await expect(page.getByText(/网络错误/)).toBeVisible()
    },
    用户取消下载该格式文件: () =>
      clickFileAction(page, "取消下载", "cancel_book_download"),
    下载进度发生变化: () =>
      page.evaluate(() =>
        window.__DOWNLOAD_STATE_MOCK__.emit("EPUB", "downloading", 768),
      ),
    下载任务成功完成: () => emitMockDownloadStatus(page, "已下载"),
    用户删除该格式文件: () =>
      clickFileAction(page, "删除本地文件", "delete_local_book_file"),
    删除该格式文件失败: async () => {
      await page.evaluate(() => window.__DOWNLOAD_STATE_MOCK__.failDelete())
      await clickFileAction(page, "删除本地文件", "delete_local_book_file")
      await expect(
        page.getByText("删除本地文件失败", { exact: true }),
      ).toBeVisible()
    },
  }
  expect(events[event], `未实现的文件事件: ${event}`).toBeDefined()
  await events[event]()
  if (
    event === "下载进度发生变化" &&
    fileEntrypoints.get(page) !== "书籍详情页"
  ) {
    await expect(page.getByRole("img", { name: "已下载 75%" })).toBeVisible()
  }
})

Then("当前入口应显示{word}及对应操作", async ({ page }, status: string) => {
  await expectFileActions(page, status)
})

When("用户打开阅读器", async ({ page }) => {
  await setMockWindowKind(page, "reader")
  const readerPage = new ReaderPage(page)
  await readerPage.goto(TEST_BOOK_ID, "EPUB")
})

Then("阅读器应显示图书内容", async ({ page }) => {
  await expect(
    page
      .frameLocator("iframe:visible")
      .first()
      .getByText("MyReader reads this first sentence aloud.", { exact: false }),
  ).toBeVisible()
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

When("阅读器下载发生{word}", async ({ page }, event: string) => {
  const events: Record<string, () => Promise<void>> = {
    下载进度发生变化: () => emitMockDownloadStatus(page, "下载中"),
    下载任务成功完成: () => emitMockDownloadStatus(page, "已下载"),
    下载任务失败: () => emitMockDownloadStatus(page, "下载失败"),
    用户取消下载该格式文件: () =>
      page.getByRole("button", { name: "取消", exact: true }).click(),
    用户关闭阅读器窗口: () =>
      page.evaluate(() => {
        ;(
          window as unknown as { __TAURI_TEST__: { closeWindow: () => void } }
        ).__TAURI_TEST__.closeWindow()
      }),
    用户重试下载该格式文件: async () => {
      await emitMockDownloadStatus(page, "下载失败")
      await expect(
        page.getByText("网络错误", { exact: true }).first(),
      ).toBeVisible()
      await page.getByRole("button", { name: "重试", exact: true }).click()
      await expect
        .poll(
          async () =>
            (await mockDownloadCommands(page)).filter(
              (c) => c.command === "download_book_file",
            ).length,
        )
        .toBe(2)
    },
  }
  expect(events[event], `未实现的阅读器事件: ${event}`).toBeDefined()
  await events[event]()
  if (event === "下载进度发生变化") {
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "50",
    )
  }
})

Then("阅读器下载结果应为{word}", async ({ page }, status: string) => {
  const assertions: Record<string, () => Promise<void>> = {
    下载中: async () => {
      await expect(page.getByText("正在下载", { exact: true })).toBeVisible()
      await expect(
        page.getByRole("button", { name: "取消", exact: true }),
      ).toBeEnabled()
    },
    已打开: async () => {
      await expect(
        page
          .frameLocator("iframe:visible")
          .first()
          .getByText("MyReader reads this first sentence aloud.", {
            exact: false,
          }),
      ).toBeVisible()
    },
    下载失败: async () => {
      await expect(
        page.getByText("网络错误", { exact: true }).first(),
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "重试", exact: true }),
      ).toBeEnabled()
    },
    已关闭: async () => {
      await expectCommand(page, "cancel_book_download")
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as unknown as {
                  __TAURI_TEST__: { calls: Record<string, number> }
                }
              ).__TAURI_TEST__.calls.window_close ?? 0,
          ),
        )
        .toBeGreaterThan(0)
    },
  }
  expect(assertions[status], `未实现的阅读器状态: ${status}`).toBeDefined()
  await assertions[status]()
})

When("用户依次查看书库首页和书籍详情页", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: /下载状态测试书/ }).waitFor()
  await replayMockDownloadProgress(page)
})

Then("这些入口应显示相同的{word}", async ({ page }, status: string) => {
  fileEntrypoints.set(page, "首页上下文菜单")
  await expectFileActions(page, status)
  const badge = page
    .getByRole("button", { name: /下载状态测试书/ })
    .locator("[data-download-status]")
  if (status === "已下载") await expect(badge).toHaveCount(0)
  else {
    const expected =
      (
        { 准备下载: "starting", 下载中: "downloading" } as Record<
          string,
          string
        >
      )[status] ?? "remote_only"
    await expect(badge).toHaveAttribute("data-download-status", expected)
  }
  if (status === "下载中")
    await expect(badge).toHaveAccessibleName("已下载 50%")
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: /下载状态测试书/ }).click()
  await expect(
    page.getByRole("heading", { name: "下载状态测试书", exact: true }),
  ).toBeVisible()
  fileEntrypoints.set(page, "书籍详情页")
  await expectFileActions(page, status)
})
