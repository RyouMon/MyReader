import type { Page } from "@playwright/test"

export class LibraryPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/")
  }

  async waitForBooksLoaded() {
    // Wait until book cards are rendered (not skeletons)
    await this.page.waitForSelector('[role="button"][tabindex="0"]', {
      timeout: 10000,
    })
  }

  async setViewport(width: number, height = 900) {
    await this.page.setViewportSize({ width, height })
  }

  async getVisibleBookCards() {
    return this.page.locator('[role="button"][tabindex="0"]')
  }

  async scrollDown(pixels = 800) {
    await this.page.evaluate((px) => window.scrollBy(0, px), pixels)
  }

  async scrollToBottom() {
    await this.page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight),
    )
  }
}
