describe("MyReader desktop shell", () => {
  beforeEach(async () => {
    await browser.url("/")
  })

  it("加载后展示应用品牌", async () => {
    const branding = await $("span=MyReader")
    await expect(branding).toBeDisplayed()
  })

  it("可从侧边栏进入设置页", async () => {
    const settingsEntry = await $("a[href=\"/settings\"]")
    await settingsEntry.click()

    const settingsHeader = await $("h1=书库管理")
    await expect(settingsHeader).toBeDisplayed()
  })
})
