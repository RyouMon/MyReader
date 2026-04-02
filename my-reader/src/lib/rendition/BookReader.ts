import {
  layoutTextChapterAtMeasureHost,
  ProgressivePaginator,
} from "./pagination/ProgressivePaginator"
import { ComicParser } from "./parsers/ComicParser"
import { EpubParser } from "./parsers/EpubParser"
import { PdfParser } from "./parsers/PdfParser"
import type {
  BookMetadata,
  ChapterData,
  ChapterInfo,
  ContentType,
  IPaginator,
  IParser,
  LayoutConfig,
  PageData,
  ParsedBook,
  ReaderProgress,
  TextChapterPaginationResult,
  TocItem,
} from "./types"

/**
 * Headless reader state machine.
 *
 * Owns the parser, manages current chapter index, and exposes
 * navigation primitives. Contains zero DOM or rendering logic
 * — the consumer decides how to present the data.
 *
 * {@link curPage} / {@link prevPage} / {@link nextPage} 在导航键（章、偏移、章内总页、全书章数）
 * 不变时保持同一对象引用；键变化时替换为新对象，便于 React 等用 `Object.is` 触发更新。
 * 请勿修改返回的 {@link PageData}。
 */
export class BookReader {
  private parser: IParser | null = null
  private paginator: IPaginator<any, PageData> | null = null
  private book: ParsedBook | null = null
  private _currentIndex = 0
  private _layoutConfig: LayoutConfig | null = null
  private _currentPageOffset = 0
  private _totalPagesOfCurChapter = 1
  private _chapterStartFromEnd = false
  private _ready = false

  /** 与导航键一致时 {@link curPage}/{@link prevPage}/{@link nextPage} 复用同一对象引用 */
  private _pageDescriptorKey = ""
  private _curPageCache: PageData = {
    index: 0,
    chapter: 0,
    columns: [],
    isStartOfChapter: true,
    isEndOfChapter: true,
  }
  private _prevPageCache: PageData | null = null
  private _nextPageCache: PageData | null = null

  get ready(): boolean {
    return this._ready
  }

  get metadata(): BookMetadata {
    return this.book?.metadata ?? {}
  }

  get toc(): TocItem[] {
    return this.book?.toc ?? []
  }

  get chapters(): ChapterInfo[] {
    return this.book?.chapters ?? []
  }

  get totalChapters(): number {
    return this.book?.chapters.length ?? 0
  }

  /** 当前章节下标（与架构文档中的 curChapter 一致） */
  get curChapter(): number {
    return this._currentIndex
  }

  get currentIndex(): number {
    return this._currentIndex
  }

  get contentType(): ContentType {
    return this.book?.contentType ?? "text"
  }

  get layoutConfig(): LayoutConfig | null {
    return this._layoutConfig
  }

  get totalPagesOfCurChapter(): number {
    return this._totalPagesOfCurChapter
  }

  get chapterStartFromEnd(): boolean {
    return this._chapterStartFromEnd
  }

  get curPage(): PageData {
    this.ensurePageDescriptorCaches()
    return this._curPageCache
  }

  get prevPage(): PageData | null {
    this.ensurePageDescriptorCaches()
    return this._prevPageCache
  }

  get nextPage(): PageData | null {
    this.ensurePageDescriptorCaches()
    return this._nextPageCache
  }

  /**
   * Parse the book buffer and prepare for reading.
   */
  async init(buffer: ArrayBuffer, format: string): Promise<ParsedBook> {
    this.parser = BookReader.createParser(format)
    this.book = await this.parser.parse(buffer)
    this.paginator =
      this.book.contentType === "text" ? new ProgressivePaginator() : null
    this._currentIndex = 0
    this._currentPageOffset = 0
    this._totalPagesOfCurChapter = 1
    this._chapterStartFromEnd = false
    this._ready = true
    this.invalidatePageDescriptorCaches()
    return this.book
  }

  /**
   * Get the full chapter data for a given index (defaults to current).
   * Results are cached inside the parser.
   */
  async getChapter(index?: number): Promise<ChapterData> {
    if (!this.parser || !this.book) {
      throw new Error("Reader not initialized — call init() first")
    }
    const idx = index ?? this._currentIndex
    if (idx < 0 || idx >= this.totalChapters) {
      throw new Error(`Chapter index out of range: ${idx}`)
    }
    return this.parser.getChapter(idx)
  }

  /**
   * 应用版式配置。文本书且传入 `measureHost` 时，在隐藏容器中测量当前章并填充分页器；
   * 仅传 `config` 时（文本书）只清空分页缓存，待下次带 `measureHost` 的调用再测量。
   * 非 {@link ProgressivePaginator} 时走通用 `IPaginator.layout`。
   */
  async layout(
    config: LayoutConfig,
    measureHost?: HTMLDivElement | null,
  ): Promise<TextChapterPaginationResult | undefined> {
    this._layoutConfig = config
    if (!this.paginator) return undefined
    if (this.paginator instanceof ProgressivePaginator) {
      if (measureHost) {
        const ch = await this.getChapter(this._currentIndex)
        if (ch.type !== "text") {
          throw new Error("layout(measureHost) requires a text chapter")
        }
        return layoutTextChapterAtMeasureHost(
          ch,
          config,
          measureHost,
          this.paginator,
        )
      }
      await this.paginator.clearCache()
      return undefined
    }
    const chapter = await this.getChapter(this._currentIndex)
    await this.paginator.layout(chapter, config)
    this.syncPageStateFromPaginator()
    return undefined
  }

  /** Navigate to a specific chapter. */
  gotoChapter(index: number): void {
    if (index < 0 || index >= this.totalChapters) return
    this._currentIndex = index
    this._currentPageOffset = 0
    this._totalPagesOfCurChapter = 1
    this._chapterStartFromEnd = false
    this.invalidatePageDescriptorCaches()
  }

  /**
   * Navigates to chapter and marks render to start from chapter tail.
   */
  gotoChapterFromEnd(index: number): void {
    if (index < 0 || index >= this.totalChapters) return
    this._currentIndex = index
    this._currentPageOffset = 0
    this._totalPagesOfCurChapter = 1
    this._chapterStartFromEnd = true
    this.invalidatePageDescriptorCaches()
  }

  /**
   * Jumps to a chapter/page offset pair.
   */
  async gotoPage(chapter: number, offset: number): Promise<ChapterData> {
    const startFromEnd = Number.isFinite(offset) && offset > 10_000
    if (startFromEnd) this.gotoChapterFromEnd(chapter)
    else this.gotoChapter(chapter)
    const ch = await this.getChapter(chapter)
    if (this.paginator instanceof ProgressivePaginator) {
      await this.paginator.clearCache()
      if (!startFromEnd) {
        this._currentPageOffset = Math.max(0, offset)
      } else {
        this._currentPageOffset = 0
      }
      this._totalPagesOfCurChapter = 1
      this.invalidatePageDescriptorCaches()
      return ch
    }
    if (this.paginator) {
      if (this._layoutConfig) {
        await this.paginator.layout(ch, this._layoutConfig)
      }
      await this.paginator.gotoPage(offset)
      this.syncPageStateFromPaginator()
      return ch
    }
    this._currentPageOffset = Math.max(
      0,
      Math.min(offset, Math.max(0, this._totalPagesOfCurChapter - 1)),
    )
    this.invalidatePageDescriptorCaches()
    return ch
  }

  /**
   * Advances one page and crosses chapter boundary when needed.
   */
  async gotoNextPage(): Promise<ChapterData | null> {
    if (this.paginator instanceof ProgressivePaginator) {
      const slices = this.paginator.getAllSlices()
      if (slices.length > 0) {
        const lastIdx = slices.length - 1
        const before = this.paginator.curPage?.index ?? -1
        await this.paginator.gotoNextPage()
        const after = this.paginator.curPage?.index ?? -1
        if (after !== before) {
          this.syncPageStateFromPaginator()
          return this.getChapter(this._currentIndex)
        }
        if (before >= lastIdx) {
          if (!this.nextChapter()) return null
          const ch = await this.getChapter(this._currentIndex)
          this._chapterStartFromEnd = false
          await this.paginator.clearCache()
          this._currentPageOffset = 0
          this._totalPagesOfCurChapter = 1
          this.invalidatePageDescriptorCaches()
          return ch
        }
      }
      if (this._currentPageOffset < this._totalPagesOfCurChapter - 1) {
        this._currentPageOffset += 1
        this.invalidatePageDescriptorCaches()
        return this.getChapter(this._currentIndex)
      }
      if (!this.nextChapter()) return null
      return this.getChapter(this._currentIndex)
    }
    if (this.paginator) {
      await this.paginator.gotoNextPage()
      if (this.paginator.curPage) {
        this.syncPageStateFromPaginator()
        return this.getChapter(this._currentIndex)
      }
      if (!this.nextChapter()) return null
      const ch = await this.getChapter(this._currentIndex)
      this._chapterStartFromEnd = false
      if (this._layoutConfig)
        await this.paginator.layout(ch, this._layoutConfig)
      await this.paginator.gotoPage(0)
      this.syncPageStateFromPaginator()
      return ch
    }
    if (this._currentPageOffset < this._totalPagesOfCurChapter - 1) {
      this._currentPageOffset += 1
      this.invalidatePageDescriptorCaches()
      return this.getChapter(this._currentIndex)
    }
    if (!this.nextChapter()) return null
    return this.getChapter(this._currentIndex)
  }

  /**
   * Moves one page backward and crosses chapter boundary when needed.
   */
  async gotoPrevPage(): Promise<ChapterData | null> {
    if (this.paginator instanceof ProgressivePaginator) {
      const slices = this.paginator.getAllSlices()
      if (slices.length > 0) {
        const before = this.paginator.curPage?.index ?? -1
        await this.paginator.gotoPrevPage()
        const after = this.paginator.curPage?.index ?? -1
        if (after !== before) {
          this.syncPageStateFromPaginator()
          return this.getChapter(this._currentIndex)
        }
        if (before <= 0) {
          if (!this.prevChapter()) return null
          const ch = await this.getChapter(this._currentIndex)
          this._chapterStartFromEnd = true
          await this.paginator.clearCache()
          this._currentPageOffset = 0
          this._totalPagesOfCurChapter = 1
          this.invalidatePageDescriptorCaches()
          return ch
        }
      }
      if (this._currentPageOffset > 0) {
        this._currentPageOffset -= 1
        this.invalidatePageDescriptorCaches()
        return this.getChapter(this._currentIndex)
      }
      if (!this.prevChapter()) return null
      return this.getChapter(this._currentIndex)
    }
    if (this.paginator) {
      await this.paginator.gotoPrevPage()
      if (this.paginator.curPage) {
        this.syncPageStateFromPaginator()
        return this.getChapter(this._currentIndex)
      }
      if (!this.prevChapter()) return null
      const ch = await this.getChapter(this._currentIndex)
      this._chapterStartFromEnd = true
      if (this._layoutConfig)
        await this.paginator.layout(ch, this._layoutConfig)
      await this.paginator.gotoPage(Number.MAX_SAFE_INTEGER)
      this.syncPageStateFromPaginator()
      return ch
    }
    if (this._currentPageOffset > 0) {
      this._currentPageOffset -= 1
      this.invalidatePageDescriptorCaches()
      return this.getChapter(this._currentIndex)
    }
    if (!this.prevChapter()) return null
    return this.getChapter(this._currentIndex)
  }

  /**
   * Jumps to a rendered page inside current chapter without reloading chapter content.
   */
  gotoPageInChapter(totalPages: number, pageOffset: number): void {
    this._totalPagesOfCurChapter = Math.max(1, totalPages)
    this._currentPageOffset = Math.max(
      0,
      Math.min(pageOffset, this._totalPagesOfCurChapter - 1),
    )
    if (this.paginator instanceof ProgressivePaginator) {
      void this.paginator.gotoPage(this._currentPageOffset)
    }
    this.syncPageStateFromPaginator()
  }

  /** Move to the next chapter. Returns `false` if already at the end. */
  nextChapter(): boolean {
    if (this._currentIndex >= this.totalChapters - 1) return false
    this.gotoChapter(this._currentIndex + 1)
    return true
  }

  /** Move to the previous chapter. Returns `false` if already at the start. */
  prevChapter(): boolean {
    if (this._currentIndex <= 0) return false
    this.gotoChapter(this._currentIndex - 1)
    return true
  }

  getProgress(): ReaderProgress {
    const info = this.book?.chapters[this._currentIndex]
    return {
      chapterIndex: this._currentIndex,
      chapterTitle: info?.title ?? "",
      totalChapters: this.totalChapters,
    }
  }

  destroy(): void {
    this.parser?.destroy()
    this.parser = null
    this.book = null
    this._ready = false
    this._currentIndex = 0
    this._layoutConfig = null
    this.paginator = null
    this._currentPageOffset = 0
    this._totalPagesOfCurChapter = 1
    this._chapterStartFromEnd = false
    this.invalidatePageDescriptorCaches()
  }

  /**
   * Builds page descriptor from current chapter/page pointers.
   */
  private makePage(chapter: number, index: number): PageData {
    return {
      index,
      chapter,
      columns: [],
      isStartOfChapter: index === 0,
      isEndOfChapter: index >= this._totalPagesOfCurChapter - 1,
    }
  }

  private invalidatePageDescriptorCaches(): void {
    this._pageDescriptorKey = ""
  }

  private ensurePageDescriptorCaches(): void {
    const key = `${this._currentIndex}:${this._currentPageOffset}:${this._totalPagesOfCurChapter}:${this.totalChapters}`
    if (key === this._pageDescriptorKey) return
    this._pageDescriptorKey = key

    this._curPageCache = this.makePage(
      this._currentIndex,
      this._currentPageOffset,
    )

    this._prevPageCache =
      this._currentPageOffset > 0
        ? this.makePage(this._currentIndex, this._currentPageOffset - 1)
        : this._currentIndex <= 0
          ? null
          : this.makePage(this._currentIndex - 1, 0)

    this._nextPageCache =
      this._currentPageOffset < this._totalPagesOfCurChapter - 1
        ? this.makePage(this._currentIndex, this._currentPageOffset + 1)
        : this._currentIndex >= this.totalChapters - 1
          ? null
          : this.makePage(this._currentIndex + 1, 0)
  }

  /**
   * Mirrors paginator page pointers onto reader state.
   */
  private syncPageStateFromPaginator(): void {
    if (!this.paginator?.curPage) {
      if (this.paginator instanceof ProgressivePaginator) {
        this.invalidatePageDescriptorCaches()
        return
      }
      this._currentPageOffset = 0
      this._totalPagesOfCurChapter = 1
      this.invalidatePageDescriptorCaches()
      return
    }
    this._currentPageOffset = this.paginator.curPage.index
    const total = this.paginator.nextPage
      ? Math.max(this.paginator.nextPage.index + 1, this._currentPageOffset + 1)
      : this._currentPageOffset + 1
    this._totalPagesOfCurChapter = Math.max(1, total)
    this.invalidatePageDescriptorCaches()
  }

  private static createParser(format: string): IParser {
    switch (format.toUpperCase()) {
      case "EPUB":
        return new EpubParser()
      case "CBZ":
        return new ComicParser()
      case "CBR":
        throw new Error(
          "CBR（RAR 压缩）暂不支持客户端解压，请将漫画转为 CBZ（ZIP）后在书库中阅读。",
        )
      case "PDF":
        return new PdfParser()
      default:
        throw new Error(`Unsupported format: ${format}`)
    }
  }
}
