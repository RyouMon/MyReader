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
      '[data-slot="sidebar"]:not([data-mobile]) [data-testid="sidebar-toggle-button"]',
    )
  }

  // Mobile Sheet trigger (inside the overlay)
  getMobileSheetTriggerButton() {
    return this.page.locator(
      '[data-slot="sidebar"][data-mobile="true"] [data-testid="sidebar-toggle-button"]',
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

  // --- Library switcher locators ---
  getLibrarySwitcherButton() {
    return this.page
      .locator('[data-slot="sidebar"] [data-slot="sidebar-menu-button"]')
      .first()
  }

  getLibrarySwitcherDropdown() {
    return this.page.locator('[data-slot="dropdown-menu-content"]')
  }

  getLibrarySwitcherMenuItems() {
    return this.page
      .locator(
        '[data-slot="dropdown-menu-content"] [data-slot="dropdown-menu-item"]',
      )
      .filter({ hasNotText: "添加书库" })
  }

  getLibrarySwitcherAddButton() {
    return this.page
      .locator('[data-slot="dropdown-menu-content"]')
      .getByText("添加书库")
  }

  getLibrarySwitcherEmptyHint() {
    return this.page
      .locator('[data-slot="dropdown-menu-content"]')
      .getByText("暂无书库")
  }

  // --- Sidebar assertions ---
  async assertSidebarExpanded() {
    await expect(this.getDesktopSidebar()).toHaveAttribute(
      "data-state",
      "expanded",
    )
    await expect(this.getSidebarTriggerButton()).toBeVisible()
  }

  async assertSidebarCollapsed() {
    await expect(this.getDesktopSidebar()).toBeVisible()
    await expect(this.getDesktopSidebar()).toHaveAttribute(
      "data-state",
      "collapsed",
    )
    await expect(this.getSidebarTriggerButton()).toBeVisible()
  }

  async assertMobileSheetOpen() {
    await expect(this.getMobileSheet()).toBeVisible()
    await expect(this.getMobileSheetTriggerButton()).toBeVisible()
  }

  async assertMobileSheetClosed() {
    await expect(this.getMobileSheet()).not.toBeVisible()
    await expect(this.getSidebarTriggerButton()).toBeVisible()
  }

  // --- Library switcher assertions ---
  async assertLibrarySwitcherDropdownVisible() {
    await expect(this.getLibrarySwitcherDropdown()).toBeVisible()
  }

  async assertLibrarySwitcherDropdownHidden() {
    await expect(this.getLibrarySwitcherDropdown()).not.toBeVisible()
  }

  async assertLibraryMenuItemsCount(expectedCount: number) {
    await expect(this.getLibrarySwitcherMenuItems()).toHaveCount(expectedCount)
  }

  async assertActiveLibraryHighlighted(name: string) {
    const item = this.page
      .locator('[data-slot="dropdown-menu-content"]')
      .getByRole("menuitem")
      .filter({ hasText: name })
    await expect(item).toBeVisible()
    await expect(
      item.locator('[data-testid="active-library-check"]'),
    ).toBeVisible()
  }

  async assertLibrarySwitcherHeaderShows(name: string) {
    const header = this.page
      .locator('[data-slot="sidebar-header"]')
      .locator('[data-slot="sidebar-menu-button"]')
    await expect(header).toContainText(name)
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

  // --- Library switcher actions ---
  async clickLibrarySwitcherButton() {
    await this.getLibrarySwitcherButton().click()
  }

  async clickLibraryMenuItem(name: string) {
    await this.page
      .locator('[data-slot="dropdown-menu-content"]')
      .getByRole("menuitem")
      .filter({ hasText: name })
      .click()
  }

  async clickLibrarySwitcherAddButton() {
    await this.getLibrarySwitcherAddButton().click()
  }
}
