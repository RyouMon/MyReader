import type { Page } from "@playwright/test"

export class ReaderPage {
  constructor(private readonly page: Page) {}

  async goto(bookId: number, format?: string) {
    const search = format ? `?format=${encodeURIComponent(format)}` : ""
    await this.page.goto(`/read/${bookId}${search}`)
  }

  getInitialLoading() {
    return this.page.locator("role=status").filter({ hasText: /正在加载书籍/ })
  }

  getReadiumLoading() {
    return this.page.locator("role=status").filter({ hasText: /正在加载/ })
  }

  getErrorMessage() {
    return this.page.locator("text=加载失败")
  }

  getReaderChrome() {
    return this.page.locator("[data-reader-theme]")
  }

  async isShowingInitialLoading(): Promise<boolean> {
    return this.getInitialLoading().isVisible()
  }

  async isShowingError(): Promise<boolean> {
    return this.getErrorMessage().isVisible()
  }

  async isShowingReaderChrome(): Promise<boolean> {
    return this.getReaderChrome().isVisible()
  }

  async waitForInitialLoadingToDisappear(timeout = 5000) {
    await this.getInitialLoading().waitFor({ state: "hidden", timeout })
  }

  async waitForError(timeout = 5000) {
    await this.getErrorMessage().waitFor({ state: "visible", timeout })
  }

  async waitForReaderChrome(timeout = 5000) {
    await this.getReaderChrome().waitFor({ state: "visible", timeout })
  }
}
