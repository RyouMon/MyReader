import { Given, Then } from '@wdio/cucumber-framework'
import { expect } from '@wdio/globals'

Given('应用已启动', async () => {
  await browser.url('/')
})

Then('主窗口应该可见', async () => {
  const body = await $('body')
  await expect(body).toBeDisplayed()
})

Then('页面应该显示应用标题 {string}', async (text: string) => {
  const branding = await $(`span*=${text}`)
  await expect(branding).toBeDisplayed()
})
