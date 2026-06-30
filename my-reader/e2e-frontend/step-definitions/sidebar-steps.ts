import { createBdd } from "playwright-bdd"
import { test } from "../fixtures/test"
import { MainPage } from "../pages/MainPage"

const { Given, When, Then } = createBdd(test)

// "用户访问书库首页" is defined in library-browsing-steps.ts

Given("窗口宽度足够显示侧边栏", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.setDesktopViewport()
})

Given("侧边栏已折叠", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.clickSidebarCollapseButton()
  await mainPage.assertSidebarCollapsed()
})

Given("窗口宽度调整为移动端宽度", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.setMobileViewport()
})

Given("侧边栏已以叠加层形式展开", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.clickSidebarExpandButton()
})

When("用户点击侧边栏折叠按钮", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.clickSidebarCollapseButton()
})

When("用户点击侧边栏展开按钮", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.clickSidebarExpandButton()
})

When("用户点击叠加层外的空白区域", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.clickOverlayOutside()
})

Then("侧边栏应该处于展开状态", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.assertSidebarExpanded()
})

Then("侧边栏应该处于折叠状态", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.assertSidebarCollapsed()
})

Then("最小化侧边栏应该保持可见", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.assertSidebarCollapsed()
})

Then("侧边栏应该以叠加层形式展开", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.assertMobileSheetOpen()
})

Then("侧边栏叠加层应该关闭", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.assertMobileSheetClosed()
})
