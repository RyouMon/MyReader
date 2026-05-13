import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'

const { Given, When, Then } = createBdd()

Given('the user is on the settings page', async ({ page }) => {
  await page.goto('/settings')
})

Given('the user is on the home page', async ({ page }) => {
  await page.goto('/')
})

When('the user clicks the settings link in the sidebar', async ({ page }) => {
  await page.getByRole('link', { name: /settings|设置/i }).click()
})

Then('the page heading should show {string}', async ({ page }, text: string) => {
  await expect(page.getByRole('heading', { name: text })).toBeVisible()
})

Then('the add library button should be visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: /添加书库/i })).toBeVisible()
})

Then('the user should be on the settings page', async ({ page }) => {
  await expect(page).toHaveURL(/\/settings/)
})
