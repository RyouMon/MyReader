import type { Locator, Page } from "@playwright/test"

interface GridMetrics {
  cols: number
  rowHeight: number
  virtualListTop: number
}

export class LibraryPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/")
  }

  async waitForBooksLoaded() {
    // Wait until book cards are rendered (not skeletons)
    await this.page.waitForSelector('[role="button"][tabindex="0"]')
  }

  async setViewport(width: number, height = 900) {
    await this.page.setViewportSize({ width, height })
    await this.waitForLayoutSettled()
  }

  async getVisibleBookCards() {
    return this.page.locator('[role="button"][tabindex="0"]')
  }

  getBook(bookNumber: number): Locator {
    return this.page.getByRole("button", {
      name: `打开《测试书籍 ${bookNumber}》`,
      exact: true,
    })
  }

  getScrollViewport(): Locator {
    return this.page.getByTestId("library-scroll")
  }

  async waitForDetailPane() {
    await this.page.getByTestId("book-detail-pane").waitFor()
  }

  async openBookDetail(bookNumber: number) {
    await this.getBook(bookNumber).click()
    await this.waitForDetailPane()
  }

  async closeBookDetail() {
    await this.page.getByTestId("book-detail-close").click()
    await this.page.getByTestId("book-detail-pane").waitFor({ state: "hidden" })
  }

  async scrollBookRowToTop(bookNumber: number) {
    await this.scrollBookToPercent(bookNumber, 0, "row-start")
  }

  async scrollBookCenterToPercent(bookNumber: number, percent: number) {
    await this.scrollBookToPercent(bookNumber, percent, "row-center")
  }

  async isBookInTopVisibleRow(bookNumber: number): Promise<boolean> {
    await this.getBook(bookNumber).waitFor()
    return this.page.evaluate((targetLabel) => {
      const viewport = document.querySelector<HTMLElement>(
        '[data-testid="library-scroll"]',
      )
      if (!viewport) return false
      const viewportBox = viewport.getBoundingClientRect()
      const buttons = Array.from(
        viewport.querySelectorAll<HTMLElement>('[role="button"][tabindex="0"]'),
      )
      const visibleBoxes = buttons
        .map((button) => ({
          label: button.getAttribute("aria-label") ?? "",
          box: button.getBoundingClientRect(),
        }))
        .filter(({ box }) => {
          const centerY = box.top + box.height / 2
          return centerY >= viewportBox.top && centerY <= viewportBox.bottom
        })
      if (visibleBoxes.length === 0) return false
      const firstRowTop = Math.min(...visibleBoxes.map(({ box }) => box.top))
      const target = visibleBoxes.find(({ label }) => label === targetLabel)
      if (!target) return false
      return Math.abs(target.box.top - firstRowTop) <= 4
    }, this.bookAriaLabel(bookNumber))
  }

  async getTopVisibleBookNumbers(): Promise<number[]> {
    return this.page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>(
        '[data-testid="library-scroll"]',
      )
      if (!viewport) return []
      const viewportBox = viewport.getBoundingClientRect()
      const buttons = Array.from(
        viewport.querySelectorAll<HTMLElement>('[role="button"][tabindex="0"]'),
      )
      const visibleBoxes = buttons
        .map((button) => ({
          label: button.getAttribute("aria-label") ?? "",
          box: button.getBoundingClientRect(),
        }))
        .filter(({ box }) => {
          const centerY = box.top + box.height / 2
          return centerY >= viewportBox.top && centerY <= viewportBox.bottom
        })
      if (visibleBoxes.length === 0) return []
      const firstRowTop = Math.min(...visibleBoxes.map(({ box }) => box.top))
      return visibleBoxes
        .filter(({ box }) => Math.abs(box.top - firstRowTop) <= 4)
        .map(({ label }) => Number(label.match(/\d+/)?.[0] ?? Number.NaN))
        .filter((bookNumber) => Number.isFinite(bookNumber))
    })
  }

  async getBookCenterPercent(bookNumber: number): Promise<number> {
    await this.getBook(bookNumber).waitFor()
    return this.page.evaluate((targetLabel) => {
      const viewport = document.querySelector<HTMLElement>(
        '[data-testid="library-scroll"]',
      )
      const target = Array.from(
        document.querySelectorAll<HTMLElement>('[role="button"][tabindex="0"]'),
      ).find((button) => button.getAttribute("aria-label") === targetLabel)
      if (!viewport || !target) {
        throw new Error(`Book not visible: ${targetLabel}`)
      }
      const viewportBox = viewport.getBoundingClientRect()
      const targetBox = target.getBoundingClientRect()
      const targetCenter = targetBox.top + targetBox.height / 2
      return ((targetCenter - viewportBox.top) / viewportBox.height) * 100
    }, this.bookAriaLabel(bookNumber))
  }

  async scrollDown(pixels = 800) {
    await this.page.evaluate((px) => window.scrollBy(0, px), pixels)
  }

  async scrollToBottom() {
    await this.page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight),
    )
  }

  private bookAriaLabel(bookNumber: number) {
    return `打开《测试书籍 ${bookNumber}》`
  }

  private async waitForLayoutSettled() {
    await this.page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => resolve())
            })
          })
        }),
    )
  }

  private async scrollBookToPercent(
    bookNumber: number,
    percent: number,
    anchor: "row-start" | "row-center",
  ) {
    const metrics = await this.getGridMetrics()
    const rowIndex = Math.floor((bookNumber - 1) / metrics.cols)
    await this.getScrollViewport().evaluate(
      (
        el,
        args: {
          rowIndex: number
          rowHeight: number
          virtualListTop: number
          percent: number
          anchor: "row-start" | "row-center"
        },
      ) => {
        const anchorOffset =
          args.anchor === "row-center" ? args.rowHeight / 2 : 0
        const targetTop =
          args.virtualListTop +
          args.rowIndex * args.rowHeight +
          anchorOffset -
          el.clientHeight * (args.percent / 100)
        el.scrollTop = Math.max(
          0,
          Math.min(targetTop, el.scrollHeight - el.clientHeight),
        )
        el.dispatchEvent(new Event("scroll", { bubbles: true }))
      },
      {
        rowIndex,
        rowHeight: metrics.rowHeight,
        virtualListTop: metrics.virtualListTop,
        percent,
        anchor,
      },
    )
    await this.waitForLayoutSettled()
    await this.getBook(bookNumber).waitFor()
    await this.getScrollViewport().evaluate((el) => {
      el.dispatchEvent(new Event("scroll", { bubbles: true }))
    })
    await this.waitForLayoutSettled()
  }

  private async getGridMetrics(): Promise<GridMetrics> {
    await this.waitForBooksLoaded()
    return this.page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>(
        '[data-testid="library-scroll"]',
      )
      const row = viewport?.querySelector<HTMLElement>("[data-index]")
      const virtualList = row?.parentElement
      const grid = Array.from(row?.children ?? []).find(
        (child): child is HTMLElement =>
          child instanceof HTMLElement &&
          window.getComputedStyle(child).display === "grid",
      )
      if (!viewport || !row || !virtualList || !grid) {
        throw new Error("Library grid layout is not ready")
      }
      return {
        cols: Math.max(1, grid.children.length),
        rowHeight: row.getBoundingClientRect().height,
        virtualListTop: virtualList.offsetTop,
      }
    })
  }
}
