import { Locator, LocatorLocations } from "@readium/shared"
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist"
import { ensurePdfJsWorker } from "@/lib/pdfWorker"

export const PDF_RENDER_BASE = 1.25
export const PDF_SCALE_MIN = 1
export const PDF_SCALE_MAX = 4

export type SpreadMode = "auto" | "single" | "double"
export type PdfReadingProgression = "ltr" | "rtl"

/** RFC 3778 / Readium locators: page fragments live in `locations.fragments`, not in `href`. */
export function pdfPageFragment(page: number): string {
  return `page=${Math.max(1, Math.floor(page))}`
}

/** Resolve initial page from persisted Readium locator (new `page=` fragments or legacy `page-N` href). */
export function parsePdfStartPage(
  loc: Locator | null,
  numPages: number,
): number | null {
  if (!loc || numPages < 1) return null
  const frags = loc.locations?.fragments
  if (frags?.length) {
    for (const f of frags) {
      const m = /^page=(\d+)$/i.exec(String(f).trim())
      if (m) {
        const n = Number(m[1])
        if (n >= 1 && n <= numPages) return n
      }
    }
  }
  const pos = loc.locations?.position
  if (typeof pos === "number") {
    const n = Math.floor(pos)
    if (n >= 1 && n <= numPages) return n
  }
  const legacy = /^page-(\d+)$/i.exec(loc.href)
  if (legacy) {
    const n = Number(legacy[1])
    if (n >= 1 && n <= numPages) return n
  }
  return null
}

export interface PdfNavigatorListeners {
  positionChanged: (locator: Locator) => void
  tap: () => boolean
  click: () => boolean
}

/**
 * PdfNavigator wraps pdf.js to provide a navigator-style API compatible
 * with the Readium reader chrome (Locator-based progress, goForward/goBackward).
 *
 * Supports single/double page spread rendering, fit-to-container scaling,
 * and page caching for smoother navigation.
 */
export class PdfNavigator {
  private readonly fileUrl: string
  private readonly listeners: PdfNavigatorListeners
  private pdf: PDFDocumentProxy | null = null
  private _currentPage = 1
  private _totalPages = 0
  private _renderScale = 1
  private _spreadMode: SpreadMode = "auto"
  private _destroyed = false

  /** Page proxy cache: avoids re-fetching page data on every render. */
  private pageCache = new Map<number, PDFPageProxy>()
  private canvasRenderState = new WeakMap<
    HTMLCanvasElement,
    { generation: number; tail: Promise<void> }
  >()
  private canvasRenderCache = new WeakMap<
    HTMLCanvasElement,
    { key: string; promise: Promise<void> }
  >()

  constructor(fileUrl: string, listeners: Partial<PdfNavigatorListeners> = {}) {
    this.fileUrl = fileUrl
    this.listeners = {
      positionChanged: listeners.positionChanged ?? (() => {}),
      tap: listeners.tap ?? (() => false),
      click: listeners.click ?? (() => false),
    }
  }

  async load(initialLocator?: Locator | null): Promise<void> {
    await ensurePdfJsWorker()
    const pdfjs = await import("pdfjs-dist")
    const task = pdfjs.getDocument({
      url: this.fileUrl,
      disableAutoFetch: true,
      disableStream: false,
    })
    const pdf = await task.promise
    if (this._destroyed) {
      await pdf.destroy()
      return
    }
    this.pdf = pdf
    this._totalPages = pdf.numPages
    const parsed = parsePdfStartPage(initialLocator ?? null, pdf.numPages)
    this._currentPage = parsed ?? 1
  }

  async destroy(): Promise<void> {
    this._destroyed = true
    this.pageCache.clear()
    await this.pdf?.destroy()
    this.pdf = null
  }

  get currentPage(): number {
    return this._currentPage
  }

  get totalPages(): number {
    return this._totalPages
  }

  get renderScale(): number {
    return this._renderScale
  }

  set renderScale(scale: number) {
    this._renderScale = Math.max(PDF_SCALE_MIN, Math.min(PDF_SCALE_MAX, scale))
  }

  get spreadMode(): SpreadMode {
    return this._spreadMode
  }

  set spreadMode(mode: SpreadMode) {
    this._spreadMode = mode
  }

  /** Whether the current viewport is landscape (used for auto spread). */
  isLandscapeSpread(containerWidth: number, containerHeight: number): boolean {
    if (this._spreadMode === "single") return false
    if (this._spreadMode === "double") return true
    return containerWidth > containerHeight
  }

  /** Pages rendered in the current spread (1 or 2 page indices). */
  getSpreadPages(containerWidth: number, containerHeight: number): number[] {
    return this.getSpreadPagesAt(
      this._currentPage,
      containerWidth,
      containerHeight,
    )
  }

  private getSpreadPagesAt(
    page: number,
    containerWidth: number,
    containerHeight: number,
  ): number[] {
    if (!this.isLandscapeSpread(containerWidth, containerHeight)) {
      return [page]
    }
    // Cover (page 1) always shown as single page
    if (page === 1) return [1]
    // Double page: show current + next, unless current is the last page
    if (page < this._totalPages) {
      return [page, page + 1]
    }
    return [page]
  }

  getSpreadPagesInReadingOrder(
    containerWidth: number,
    containerHeight: number,
    readingProgression: PdfReadingProgression,
  ): number[] {
    return this.getSpreadPagesAtInReadingOrder(
      this._currentPage,
      containerWidth,
      containerHeight,
      readingProgression,
    )
  }

  private getSpreadPagesAtInReadingOrder(
    page: number,
    containerWidth: number,
    containerHeight: number,
    readingProgression: PdfReadingProgression,
  ): number[] {
    const pages = this.getSpreadPagesAt(page, containerWidth, containerHeight)
    return readingProgression === "rtl" && pages.length === 2
      ? [...pages].reverse()
      : pages
  }

  adjacentPage(direction: -1 | 1): number | null {
    if (direction > 0) {
      if (!this.canGoForward) return null
      if (this._spreadMode === "single") return this._currentPage + 1
      return this._currentPage === 1 ? 2 : this._currentPage + 2
    }

    if (!this.canGoBackward) return null
    if (this._spreadMode === "single") return this._currentPage - 1
    return this._currentPage === 2 ? 1 : Math.max(1, this._currentPage - 2)
  }

  get currentLocator(): Locator {
    const prog =
      this._totalPages > 1
        ? (this._currentPage - 1) / (this._totalPages - 1)
        : 0
    return new Locator({
      href: this.fileUrl,
      type: "application/pdf",
      title: `Page ${this._currentPage}`,
      locations: new LocatorLocations({
        fragments: [pdfPageFragment(this._currentPage)],
        position: this._currentPage,
        progression: prog,
        totalProgression: prog,
      }),
    })
  }

  get canGoForward(): boolean {
    const spread = this._spreadMode === "single" ? 1 : 2
    return this._currentPage + spread - 1 < this._totalPages
  }

  get canGoBackward(): boolean {
    return this._currentPage > 1
  }

  goForward(): void {
    if (!this.canGoForward) return
    if (this._spreadMode === "single") {
      this._currentPage = Math.min(this._currentPage + 1, this._totalPages)
    } else {
      // Cover (page 1) is single → next goes to page 2
      if (this._currentPage === 1) {
        this._currentPage = 2
      } else {
        this._currentPage = Math.min(this._currentPage + 2, this._totalPages)
      }
    }
    this.listeners.positionChanged(this.currentLocator)
  }

  goBackward(): void {
    if (!this.canGoBackward) return
    if (this._spreadMode === "single") {
      this._currentPage = Math.max(this._currentPage - 1, 1)
    } else {
      // From page 2, go back to cover (page 1)
      if (this._currentPage === 2) {
        this._currentPage = 1
      } else {
        this._currentPage = Math.max(this._currentPage - 2, 1)
      }
    }
    this.listeners.positionChanged(this.currentLocator)
  }

  goToPage(page: number): void {
    const clamped = Math.max(1, Math.min(this._totalPages, page))
    if (clamped === this._currentPage) return
    this._currentPage = clamped
    this.listeners.positionChanged(this.currentLocator)
  }

  go(locator: Locator): void {
    const page = parsePdfStartPage(locator, this._totalPages)
    if (page !== null) this.goToPage(page)
  }

  /** Get a page proxy, using cache when available. */
  private async getPage(pageNum: number): Promise<PDFPageProxy> {
    const cached = this.pageCache.get(pageNum)
    if (cached) return cached
    const pdf = this.pdf
    if (!pdf) throw new Error("PDF not loaded")
    const page = await pdf.getPage(pageNum)
    this.pageCache.set(pageNum, page)
    // Evict old entries if cache grows too large
    if (this.pageCache.size > 6) {
      const oldest = this.pageCache.keys().next().value
      if (oldest !== undefined) this.pageCache.delete(oldest)
    }
    return page
  }

  /** Serialize work per canvas because pdf.js forbids overlapping render tasks. */
  private async queueCanvasRender(
    canvas: HTMLCanvasElement,
    render: () => Promise<void>,
  ): Promise<void> {
    const previous = this.canvasRenderState.get(canvas)
    const state = {
      generation: (previous?.generation ?? 0) + 1,
      tail: Promise.resolve(),
    }
    state.tail = (previous?.tail ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (this._destroyed) return
        if (this.canvasRenderState.get(canvas) !== state) return
        await render()
      })
    this.canvasRenderState.set(canvas, state)

    try {
      await state.tail
    } finally {
      if (this.canvasRenderState.get(canvas) === state) {
        this.canvasRenderState.delete(canvas)
      }
    }
  }

  private renderCanvasWithCache(
    canvas: HTMLCanvasElement,
    key: string,
    render: (isCurrent: () => boolean) => Promise<void>,
  ): Promise<void> {
    const cached = this.canvasRenderCache.get(canvas)
    if (cached?.key === key) return cached.promise

    let entry: { key: string; promise: Promise<void> }
    const promise = this.queueCanvasRender(canvas, () =>
      render(() => this.canvasRenderCache.get(canvas) === entry),
    )
    entry = { key, promise }
    this.canvasRenderCache.set(canvas, entry)
    void promise.catch(() => {
      if (this.canvasRenderCache.get(canvas) === entry) {
        this.canvasRenderCache.delete(canvas)
      }
    })
    return promise
  }

  private commitRenderedCanvas(
    canvas: HTMLCanvasElement,
    renderedCanvas: HTMLCanvasElement,
    cssWidth: number,
    cssHeight: number,
  ): void {
    const context = canvas.getContext("2d")
    if (!context) return
    canvas.width = renderedCanvas.width
    canvas.height = renderedCanvas.height
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`
    context.drawImage(renderedCanvas, 0, 0)
  }

  /** Compute scale to fit page(s) within the container. */
  private async computeFitScale(
    containerWidth: number,
    containerHeight: number,
    pages: number[],
  ): Promise<number> {
    let totalWidth = 0
    let maxHeight = 0
    for (const p of pages) {
      const page = await this.getPage(p)
      const vp = page.getViewport({ scale: 1 })
      totalWidth += vp.width
      maxHeight = Math.max(maxHeight, vp.height)
    }
    if (totalWidth === 0 || maxHeight === 0) return 1
    const spreadGap = Math.max(0, pages.length - 1) * 4
    const scaleX = Math.max(0, containerWidth - spreadGap) / totalWidth
    const scaleY = containerHeight / maxHeight
    return Math.min(scaleX, scaleY)
  }

  /** Render the current spread to a canvas element. */
  async renderPage(
    canvas: HTMLCanvasElement,
    containerWidth: number,
    containerHeight: number,
    readingProgression: PdfReadingProgression = "ltr",
  ): Promise<void> {
    await this.renderPageAt(
      canvas,
      this._currentPage,
      containerWidth,
      containerHeight,
      readingProgression,
    )
  }

  async renderPageAt(
    canvas: HTMLCanvasElement,
    pageNumber: number,
    containerWidth: number,
    containerHeight: number,
    readingProgression: PdfReadingProgression = "ltr",
    keepDisplaySize = false,
  ): Promise<void> {
    const renderKey = [
      "spread",
      pageNumber,
      containerWidth,
      containerHeight,
      readingProgression,
      keepDisplaySize,
      this._renderScale,
      this._spreadMode,
    ].join(":")
    await this.renderCanvasWithCache(canvas, renderKey, async (isCurrent) => {
      const pdf = this.pdf
      if (!pdf || pageNumber < 1 || pageNumber > this._totalPages) return

      const pages = this.getSpreadPagesAtInReadingOrder(
        pageNumber,
        containerWidth,
        containerHeight,
        readingProgression,
      )
      const fitScale = await this.computeFitScale(
        containerWidth,
        containerHeight,
        pages,
      )
      const scale = fitScale * PDF_RENDER_BASE * this._renderScale

      const cssScale =
        PDF_RENDER_BASE * (keepDisplaySize ? this._renderScale : 1)

      if (pages.length === 1) {
        const page = await this.getPage(pages[0])
        const vp = page.getViewport({ scale })
        const renderedCanvas = canvas.ownerDocument.createElement("canvas")
        renderedCanvas.width = vp.width
        renderedCanvas.height = vp.height
        const context = renderedCanvas.getContext("2d")
        if (!context) return
        await page.render({
          canvasContext: context,
          viewport: vp,
          canvas: renderedCanvas,
        }).promise
        if (!isCurrent()) return
        this.commitRenderedCanvas(
          canvas,
          renderedCanvas,
          vp.width / cssScale,
          vp.height / cssScale,
        )
      } else {
        // Double-page spread: render side by side
        const [page1, page2] = await Promise.all([
          this.getPage(pages[0]),
          this.getPage(pages[1]),
        ])
        const vp1 = page1.getViewport({ scale })
        const vp2 = page2.getViewport({ scale })
        const gap = 4 * PDF_RENDER_BASE * this._renderScale
        const contentWidth = vp1.width + gap + vp2.width
        const contentHeight = Math.max(vp1.height, vp2.height)
        const totalWidth = Math.ceil(contentWidth)
        const totalHeight = Math.ceil(contentHeight)
        const renderedCanvas = canvas.ownerDocument.createElement("canvas")
        renderedCanvas.width = totalWidth
        renderedCanvas.height = totalHeight
        const context = renderedCanvas.getContext("2d")
        if (!context) return
        // Render left page at origin
        await page1.render({
          canvasContext: context,
          viewport: vp1,
          canvas: renderedCanvas,
        }).promise
        if (!isCurrent()) return
        // Render right page offset by left page width + gap
        context.save()
        context.translate(Math.ceil(vp1.width) + gap, 0)
        await page2.render({
          canvasContext: context,
          viewport: vp2,
          canvas: renderedCanvas,
        }).promise
        context.restore()
        if (!isCurrent()) return
        this.commitRenderedCanvas(
          canvas,
          renderedCanvas,
          contentWidth / cssScale,
          contentHeight / cssScale,
        )
      }
    })
  }

  async renderSinglePage(
    canvas: HTMLCanvasElement,
    pageNumber: number,
    containerWidth: number,
    containerHeight: number,
  ): Promise<void> {
    const renderKey = [
      "single",
      pageNumber,
      containerWidth,
      containerHeight,
      this._renderScale,
    ].join(":")
    await this.renderCanvasWithCache(canvas, renderKey, async (isCurrent) => {
      if (!this.pdf || pageNumber < 1 || pageNumber > this._totalPages) return

      const page = await this.getPage(pageNumber)
      const fitScale = await this.computeFitScale(
        containerWidth,
        containerHeight,
        [pageNumber],
      )
      const scale = fitScale * PDF_RENDER_BASE * this._renderScale
      const viewport = page.getViewport({ scale })
      const renderedCanvas = canvas.ownerDocument.createElement("canvas")
      renderedCanvas.width = viewport.width
      renderedCanvas.height = viewport.height
      const context = renderedCanvas.getContext("2d")
      if (!context) return

      await page.render({
        canvasContext: context,
        viewport,
        canvas: renderedCanvas,
      }).promise
      if (!isCurrent()) return
      this.commitRenderedCanvas(
        canvas,
        renderedCanvas,
        viewport.width / PDF_RENDER_BASE,
        viewport.height / PDF_RENDER_BASE,
      )
    })
  }
}
