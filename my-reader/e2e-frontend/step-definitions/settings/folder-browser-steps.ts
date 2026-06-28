import { expect, type Page } from "@playwright/test"
import { createBdd } from "playwright-bdd"
import {
  DEEP_PATH_ROOT,
  LONG_FOLDER_NAME,
  setupFolderBrowserMocks,
} from "../../fixtures/folder-browser-mock"
import { test } from "../../fixtures/test"
import { SettingsPage } from "../../pages/SettingsPage"

const { Given, When, Then } = createBdd(test)

// --- Setup helpers ---

async function openSettingsAndMock(page: Page) {
  const settingsPage = new SettingsPage(page)
  await setupFolderBrowserMocks(page)
  await settingsPage.goto()
  return settingsPage
}

// --- Background steps ---

Given("用户已打开添加书库面板", async ({ page }) => {
  const settingsPage = await openSettingsAndMock(page)
  await settingsPage.openAddLibraryPanel()
})

Given("已选择远程数据源", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.selectRemoteDataSourceType("webdav")
  await settingsPage.selectDataSource("Test WebDAV")
})

Given("文件夹浏览器已打开", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.openFolderBrowser()
  await settingsPage.assertFolderBrowserOpen()
})

// --- Layout action steps ---

When("打开文件夹浏览器", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.openFolderBrowser()
  await settingsPage.assertFolderBrowserOpen()
})

When("当前目录包含名称很长的文件夹", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const names = await settingsPage.getVisibleFolderNames()
  expect(names.some((name) => name.includes(LONG_FOLDER_NAME))).toBe(true)
})

When("用户进入层次很深的目录", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.clickFolder(DEEP_PATH_ROOT)
  // Navigate through all deep levels
  let names = await settingsPage.getVisibleFolderNames()
  while (names.length > 0) {
    await settingsPage.clickFolder(names[0])
    names = await settingsPage.getVisibleFolderNames()
  }
})

// --- Navigation action steps ---

When("用户点击某个文件夹", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.clickFolder("CalibreLibrary")
})

Given("用户已进入某个子目录", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.clickFolder("CalibreLibrary")
  const names = await settingsPage.getVisibleFolderNames()
  expect(names.length).toBeGreaterThan(0)
  await settingsPage.clickFolder(names[0])
})

When("用户点击面包屑中的上级目录名称", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.clickBreadcrumb("CalibreLibrary")
})

When("用户点击面包屑中的根目录", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.clickBreadcrumb("/")
})

When("用户点击返回按钮", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.clickBackButton()
})

When("用户点击取消按钮", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.clickCancelButton()
})

When("用户点击关闭按钮", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.clickCloseButton()
})

When("用户点击选择此文件夹按钮", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.clickSelectButton()
})

When(
  "在设置页面将窗口宽度调整为 {int} 像素",
  async ({ page }, width: number) => {
    const settingsPage = new SettingsPage(page)
    await settingsPage.setViewport(width)
  },
)

When("用户点击刷新按钮", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.clickRefreshButton()
})

// --- Layout assertion steps ---

Then("文件夹列表保持完整显示", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const list = settingsPage.getFolderList()
  await expect(list).toBeVisible()
  await settingsPage.assertElementWithinDialog(list)
})

Then("每个超长文件夹名称都以省略号截断末尾", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const row = settingsPage.getFolderRowByName(LONG_FOLDER_NAME)
  const textSpan = row.locator("span").first()
  await expect(textSpan).toHaveCSS("text-overflow", "ellipsis")
  await expect(textSpan).toHaveCSS("overflow", "hidden")
  await expect(textSpan).toHaveCSS("white-space", "nowrap")
})

Then("文件夹名称开头部分保持可见", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const row = settingsPage.getFolderRowByName(LONG_FOLDER_NAME)
  const textSpan = row.locator("span").first()
  // direction: ltr ensures ellipsis appears at the end, keeping the start visible
  await expect(textSpan).toHaveCSS("direction", "ltr")
})

Then("文件夹列表不超出弹窗边界", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const list = settingsPage.getFolderList()
  await settingsPage.assertElementWithinDialog(list)
})

Then("面包屑显示省略号以折叠中间路径", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const ellipsis = settingsPage.getBreadcrumbEllipsis()
  await expect(ellipsis).toBeVisible()
  await settingsPage.assertElementWithinDialog(ellipsis)
})

Then("面包屑末尾目录名称保持可见", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const items = settingsPage.getBreadcrumbItems()
  const count = await items.count()
  expect(count).toBeGreaterThan(0)
  const lastItem = items.nth(count - 1)
  await expect(lastItem).toBeVisible()
  await settingsPage.assertElementWithinDialog(lastItem)
})

When("用户点击面包屑省略号", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.openBreadcrumbEllipsis()
})

Then("省略号菜单显示被折叠的中间路径", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const option = settingsPage.getBreadcrumbEllipsisOption(DEEP_PATH_ROOT)
  await expect(option).toBeVisible()
})

When("用户点击省略号菜单中的第一个路径", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.clickBreadcrumbEllipsisOption(DEEP_PATH_ROOT)
})

Then("浏览器显示被折叠路径对应的目录内容", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const names = await settingsPage.getVisibleFolderNames()
  expect(names.some((name) => name.startsWith("LevelOne"))).toBe(true)
})

Then("面包屑显示已跳转到被折叠路径", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const breadcrumb = settingsPage.getBreadcrumb()
  await expect(breadcrumb).toContainText(DEEP_PATH_ROOT)
  await expect(breadcrumb).not.toContainText("LevelFive")
})

Then("工具栏不超出弹窗边界", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const toolbar = settingsPage.getBreadcrumb().locator("..").locator("..")
  await settingsPage.assertElementWithinDialog(toolbar)
})

Then("底部已选择路径完整显示", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const pathText = settingsPage.getSelectedPathText()
  await expect(pathText).toBeVisible()
  await expect(pathText).toHaveCSS("white-space", "normal")
})

Then("路径过长时允许换行显示", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const pathText = settingsPage.getSelectedPathText()
  const box = await pathText.boundingBox()
  expect(box).not.toBeNull()
  // A wrapped multi-line path should be taller than a single line of text (~16px)
  expect(box!.height).toBeGreaterThan(18)
  await expect(pathText).toHaveCSS("overflow-wrap", /break-word|anywhere/)
})

Then('"选择此文件夹" 按钮完整可见', async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const button = settingsPage.getSelectButton()
  await expect(button).toBeVisible()
  await expect(button).toBeEnabled()
  await settingsPage.assertElementWithinDialog(button)
})

Then("底部操作栏不超出弹窗边界", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const footer = settingsPage
    .getFolderBrowserDialog()
    .locator("[data-slot='dialog-footer']")
  await settingsPage.assertElementWithinDialog(footer)
})

Then("弹窗宽度不超过窗口宽度", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.assertNoHorizontalOverflow()
})

Then("弹窗内不出现横向滚动条", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.assertNoHorizontalOverflow()
})

// --- Navigation assertion steps ---

Then("浏览器显示该文件夹内部的目录内容", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const names = await settingsPage.getVisibleFolderNames()
  expect(names).toContain("Books")
  expect(names).toContain("Authors")
})

Then("面包屑显示已进入该文件夹", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const breadcrumb = settingsPage.getBreadcrumb()
  await expect(breadcrumb).toContainText("CalibreLibrary")
})

Then("浏览器返回该上级目录", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const names = await settingsPage.getVisibleFolderNames()
  expect(names).toContain("Books")
  expect(names).toContain("Authors")
})

Then("面包屑同步更新", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const breadcrumb = settingsPage.getBreadcrumb()
  await expect(breadcrumb).toContainText("CalibreLibrary")
  await expect(breadcrumb).not.toContainText("Books")
  await expect(breadcrumb).not.toContainText("Authors")
})

Then("浏览器返回根目录", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const names = await settingsPage.getVisibleFolderNames()
  expect(names).toContain("CalibreLibrary")
})

Then("面包屑只显示根目录", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const breadcrumb = settingsPage.getBreadcrumb()
  await expect(breadcrumb).toContainText("/")
  await expect(breadcrumb).not.toContainText("CalibreLibrary")
})

Then("文件夹浏览器关闭", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  await settingsPage.assertFolderBrowserClosed()
})

Then("书库路径输入框保持原有内容不变", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const value = await settingsPage.getPathInputValue()
  expect(value.trim()).toBe("")
})

Then("书库路径输入框显示该子目录路径", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const value = await settingsPage.getPathInputValue()
  expect(value).toContain("CalibreLibrary")
})

Then("书库路径输入框显示根目录路径", async ({ page }) => {
  const settingsPage = new SettingsPage(page)
  const value = await settingsPage.getPathInputValue()
  expect(value).toBe("/")
})
