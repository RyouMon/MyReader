import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { MainPage } from '../pages/MainPage'

const { Given, Then } = createBdd()

Given('用户访问应用首页', async ({ page }) => {
  const mainPage = new MainPage(page)
  await mainPage.goto()
})

Then('页面应该显示应用标题 {string}', async ({ page }, text: string) => {
  const mainPage = new MainPage(page)
  await expect(mainPage.getBranding()).toBeVisible()
  await expect(mainPage.getBranding()).toContainText(text)
})

Then('页面应该显示主内容区域', async ({ page }) => {
  await expect(page.locator('main, [class*="sidebar-inset"], [data-slot="sidebar-inset"]')).toBeVisible()
})
