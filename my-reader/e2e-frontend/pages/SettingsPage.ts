import { expect, type Locator, type Page } from "@playwright/test"

const DEFAULT_VIEWPORT = { width: 1280, height: 900 }

export class SettingsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/settings")
  }

  async setViewport(width: number, height = DEFAULT_VIEWPORT.height) {
    await this.page.setViewportSize({ width, height })
    await this.page.waitForTimeout(300)
  }

  // --- Add library panel ---
  getAddLibraryPanelButton() {
    return this.page
      .getByTestId("settings-activity")
      .getByRole("button", { name: "添加书库", exact: true })
  }

  async openAddLibraryPanel() {
    await this.getAddLibraryPanelButton().click()
    await this.page
      .getByRole("dialog", { name: "添加书库" })
      .getByRole("button", { name: /^打开已有书库/ })
      .click()
  }

  async selectDataSource(name: string) {
    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(`^${name}`) })
      .click()
  }

  async openFolderBrowser() {
    await this.assertFolderBrowserOpen()
  }

  async getOpenedPath(): Promise<string | null> {
    return this.page.evaluate(
      () =>
        (window as unknown as { __FOLDER_BROWSER_OPENED_PATH__?: string })
          .__FOLDER_BROWSER_OPENED_PATH__ ?? null,
    )
  }

  // --- Folder browser dialog ---
  getFolderBrowserDialog() {
    return this.page.locator('[data-slot="dialog-content"]')
  }

  async assertFolderBrowserOpen() {
    await expect(this.getFolderBrowserDialog()).toBeVisible()
    await expect(this.getFolderList()).toBeVisible()
  }

  async assertFolderBrowserClosed() {
    await expect(this.getFolderBrowserDialog()).not.toBeVisible()
  }

  getFolderBrowserTitle() {
    return this.getFolderBrowserDialog().locator('[data-slot="dialog-title"]')
  }

  getFolderList() {
    return this.getFolderBrowserDialog().locator("ul[aria-label]")
  }

  getFolderRows() {
    return this.getFolderBrowserDialog().locator("ul[aria-label] li button")
  }

  getFolderRowByName(name: string) {
    return this.getFolderBrowserDialog()
      .locator("ul[aria-label] li button")
      .filter({ hasText: name })
  }

  async clickFolder(name: string) {
    await this.getFolderRowByName(name).click()
  }

  getBreadcrumb() {
    return this.getFolderBrowserDialog().locator('nav[aria-label="Breadcrumb"]')
  }

  getBreadcrumbItems() {
    return this.getBreadcrumb().locator("ol > li")
  }

  getBreadcrumbEllipsis() {
    return this.getFolderBrowserDialog().locator(
      '[data-testid="breadcrumb-ellipsis"]',
    )
  }

  async openBreadcrumbEllipsis() {
    await this.getBreadcrumbEllipsis().click()
  }

  getBreadcrumbEllipsisOption(name: string) {
    return this.page.getByRole("menuitem", { name })
  }

  async clickBreadcrumbEllipsisOption(name: string) {
    const option = this.getBreadcrumbEllipsisOption(name)
    await option.waitFor({ state: "visible" })
    await option.click()
  }

  getBreadcrumbLink(name: string) {
    return this.getBreadcrumb().locator("button").filter({ hasText: name })
  }

  async clickBreadcrumb(name: string) {
    await this.getBreadcrumbLink(name).click()
  }

  getBackButton() {
    return this.getFolderBrowserDialog().getByRole("button", {
      name: "上一级文件夹",
      exact: true,
    })
  }

  async clickBackButton() {
    await this.getBackButton().click()
  }

  getRefreshButton() {
    return this.getFolderBrowserDialog().locator('button[aria-label="刷新"]')
  }

  async clickRefreshButton() {
    await this.getRefreshButton().click()
  }

  getCloseButton() {
    return this.getFolderBrowserDialog().getByRole("button", {
      name: "关闭",
      exact: true,
    })
  }

  async clickCloseButton() {
    await this.getCloseButton().click()
  }

  getSelectButton() {
    return this.getFolderBrowserDialog().getByRole("button", {
      name: "选择此文件夹",
    })
  }

  async clickSelectButton() {
    await this.getSelectButton().click()
  }

  getSelectedPathText() {
    return this.getFolderBrowserDialog()
      .locator("[data-slot='dialog-footer'] span")
      .first()
  }

  // --- Layout helpers ---
  async getDialogBoundingBox() {
    const box = await this.getFolderBrowserDialog().boundingBox()
    expect(box).not.toBeNull()
    return box!
  }

  async assertNoHorizontalOverflow() {
    const dialogBox = await this.getDialogBoundingBox()
    const viewport = this.page.viewportSize()
    expect(viewport).not.toBeNull()
    expect(
      dialogBox.width,
      `Dialog width ${dialogBox.width} exceeds viewport width ${viewport!.width}`,
    ).toBeLessThanOrEqual(viewport!.width)

    // Check no horizontal scrollbar on dialog content
    const hasHorizontalScrollbar = await this.getFolderBrowserDialog().evaluate(
      (el) => {
        return el.scrollWidth > el.clientWidth
      },
    )
    expect(hasHorizontalScrollbar, "Dialog has horizontal scrollbar").toBe(
      false,
    )
  }

  async assertElementWithinDialog(locator: Locator) {
    const dialogBox = await this.getDialogBoundingBox()
    const elBox = await locator.boundingBox()
    expect(elBox).not.toBeNull()

    expect(
      elBox!.x >= dialogBox.x - 1 &&
        elBox!.x + elBox!.width <= dialogBox.x + dialogBox.width + 1,
      `Element at x=${elBox!.x} width=${elBox!.width} overflows dialog ` +
        `x=${dialogBox.x} width=${dialogBox.width}`,
    ).toBe(true)
  }

  async getVisibleFolderNames(): Promise<string[]> {
    const rows = this.getFolderRows()
    const count = await rows.count()
    const names: string[] = []
    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).textContent()
      if (text) names.push(text.trim())
    }
    return names
  }
}
