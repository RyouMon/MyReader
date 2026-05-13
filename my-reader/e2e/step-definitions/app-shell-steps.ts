import { Given, When, Then } from '@wdio/cucumber-framework'
import { expect } from '@wdio/globals'

Given('the application is loaded', async () => {
  await browser.url('/')
})

Then('the branding text {string} should be visible', async (text: string) => {
  const branding = await $(`span=${text}`)
  await expect(branding).toBeDisplayed()
})

When('the user clicks the settings link in the sidebar', async () => {
  const settingsEntry = await $(`a[href="/settings"]`)
  await settingsEntry.click()
})

Then('the settings page heading {string} should be displayed', async (text: string) => {
  const settingsHeader = await $(`h1=${text}`)
  await expect(settingsHeader).toBeDisplayed()
})
