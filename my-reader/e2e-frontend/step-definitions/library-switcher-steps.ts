import { expect } from "@playwright/test"
import { createBdd } from "playwright-bdd"
import {
  createMockLibrary,
  setupLibrariesMock,
} from "../fixtures/library-mock"
import { test } from "../fixtures/test"
import { LibraryPage } from "../pages/LibraryPage"
import { MainPage } from "../pages/MainPage"

const { Given, When, Then } = createBdd(test)

const LIBRARIES = [
  createMockLibrary("test-lib-01", "第一个书库", 12),
  createMockLibrary("test-lib-02", "第二个书库", 34),
  createMockLibrary("test-lib-03", "第三个书库", 56),
]

Given("已配置多个书库", async ({ page }) => {
  await setupLibrariesMock(page, LIBRARIES)
})

Given("系统只配置了一个书库", async ({ page }) => {
  await setupLibrariesMock(page, [LIBRARIES[0]])
  await page.reload()
})

Given("系统没有配置任何书库", async ({ page }) => {
  await setupLibrariesMock(page, [])
})

Given("用户已打开书库切换菜单", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.clickLibrarySwitcherButton()
  await mainPage.assertLibrarySwitcherDropdownVisible()
})

When("用户点击侧边栏书库切换按钮", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.clickLibrarySwitcherButton()
})

When("用户点击书库列表中的第二个书库", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.clickLibraryMenuItem(LIBRARIES[1].name)
})

When("用户点击\"添加书库\"按钮", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.clickLibrarySwitcherAddButton()
})

Then("书库切换菜单应该在侧边栏右侧显示", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.assertLibrarySwitcherDropdownVisible()

  const dropdown = mainPage.getLibrarySwitcherDropdown()
  const box = await dropdown.boundingBox()

  const trigger = mainPage.getLibrarySwitcherButton()
  const triggerBox = await trigger.boundingBox()

  expect(box).not.toBeNull()
  expect(triggerBox).not.toBeNull()

  expect(box!.x + box!.width).toBeGreaterThan(
    triggerBox!.x + triggerBox!.width,
  )
})

Then("菜单中应该显示所有已配置书库", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.assertLibraryMenuItemsCount(LIBRARIES.length)

  for (const lib of LIBRARIES) {
    await expect(
      mainPage
        .getLibrarySwitcherDropdown()
        .getByRole("menuitem")
        .filter({ hasText: lib.name }),
    ).toBeVisible()
  }
})

Then("当前书库应该被高亮显示", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.assertActiveLibraryHighlighted(LIBRARIES[0].name)
})

Then("第二个书库应该成为当前书库", async ({ page }) => {
  const libraryPage = new LibraryPage(page)
  await libraryPage.waitForBooksLoaded()

  const mainPage = new MainPage(page)
  await mainPage.assertLibrarySwitcherHeaderShows(LIBRARIES[1].name)
})

Then("书库切换菜单应该关闭", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.assertLibrarySwitcherDropdownHidden()
})

Then("侧边栏头部应该显示第二个书库名称", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.assertLibrarySwitcherHeaderShows(LIBRARIES[1].name)
})

Then("书库切换菜单中应该显示\"添加书库\"按钮", async ({ page }) => {
  const mainPage = new MainPage(page)
  await expect(mainPage.getLibrarySwitcherAddButton()).toBeVisible()
})

Then("页面应该跳转到设置页", async ({ page }) => {
  await expect(page).toHaveURL(/\/settings$/)
})

Then("菜单中应该只显示一个书库", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.assertLibraryMenuItemsCount(1)
  await expect(
    mainPage
      .getLibrarySwitcherDropdown()
      .getByRole("menuitem")
      .filter({ hasText: LIBRARIES[0].name }),
  ).toBeVisible()
})

Then("该书库应该被高亮显示", async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.assertActiveLibraryHighlighted(LIBRARIES[0].name)
})

Then("菜单中应该显示\"暂无书库\"提示", async ({ page }) => {
  const mainPage = new MainPage(page)
  await expect(mainPage.getLibrarySwitcherEmptyHint()).toBeVisible()
})
