import { expect, type Page } from "@playwright/test"

const MOBILE_BREAKPOINT = 768
const DESKTOP_WIDTH = 1280
const DESKTOP_HEIGHT = 900

export class MainPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/")
  }

  getBranding() {
    return this.page.getByText("MyReader")
  }

  // --- Viewport helpers ---
  async setDesktopViewport() {
    await this.page.setViewportSize({
      width: DESKTOP_WIDTH,
      height: DESKTOP_HEIGHT,
    })
    await this.page.waitForTimeout(300)
  }

  async setMobileViewport() {
    await this.page.setViewportSize({
      width: MOBILE_BREAKPOINT - 1,
      height: DESKTOP_HEIGHT,
    })
    await this.page.waitForTimeout(500)
  }

  // --- Sidebar locators ---
  getDesktopSidebar() {
    return this.page.locator('[data-slot="sidebar"]:not([data-mobile])')
  }

  getMobileSheet() {
    return this.page.locator('[data-slot="sidebar"][data-mobile="true"]')
  }

  // Desktop trigger (also used as mobile icon-strip trigger)
  getSidebarTriggerButton() {
    return this.page.locator(
      '[data-slot="sidebar"]:not([data-mobile]) [data-slot="sidebar-trigger"]',
    )
  }

  // Mobile Sheet trigger (inside the overlay)
  getMobileSheetTriggerButton() {
    return this.page.locator(
      '[data-slot="sidebar"][data-mobile="true"] [data-slot="sidebar-trigger"]',
    )
  }

  getSheetOverlay() {
    return this.page.locator('[data-slot="sheet-overlay"]')
  }

  getCollapseIcon() {
    // Only the collapse icon inside the mobile Sheet (desktop uses getSidebarTriggerButton context)
    return this.getMobileSheet().getByTestId("sidebar-collapse-icon")
  }

  getExpandIcon() {
    // Only the expand icon inside the mobile icon strip
    return this.getDesktopSidebar().getByTestId("sidebar-expand-icon")
  }

  // --- Sidebar assertions ---
  async assertSidebarExpanded() {
    await expect(this.getDesktopSidebar()).toHaveAttribute(
      "data-state",
      "expanded",
    )
    await expect(
      this.getDesktopSidebar().getByTestId("sidebar-collapse-icon"),
    ).toBeVisible()
  }

  async assertSidebarCollapsed() {
    await expect(this.getDesktopSidebar()).toBeVisible()
    await expect(this.getDesktopSidebar()).toHaveAttribute(
      "data-state",
      "collapsed",
    )
    await expect(
      this.getDesktopSidebar().getByTestId("sidebar-expand-icon"),
    ).toBeVisible()
  }

  async assertMobileSheetOpen() {
    await expect(this.getMobileSheet()).toBeVisible()
    await expect(
      this.getMobileSheet().getByTestId("sidebar-collapse-icon"),
    ).toBeVisible()
  }

  async assertMobileSheetClosed() {
    await expect(this.getMobileSheet()).not.toBeVisible()
    await expect(
      this.getDesktopSidebar().getByTestId("sidebar-expand-icon"),
    ).toBeVisible()
  }

  // --- Sidebar actions ---
  async clickSidebarCollapseButton() {
    const isMobile = (this.page.viewportSize()?.width ?? 0) < MOBILE_BREAKPOINT
    if (isMobile) {
      await this.getMobileSheetTriggerButton().click()
    } else {
      await this.getSidebarTriggerButton().click()
    }
  }

  async clickSidebarExpandButton() {
    await this.getSidebarTriggerButton().click()
  }

  async clickOverlayOutside() {
    const viewport = this.page.viewportSize()
    await this.getSheetOverlay().click({
      position: { x: (viewport?.width ?? 767) - 5, y: 5 },
    })
  }
}
