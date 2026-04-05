import {
  type BookAnchor,
  bookAnchorFromReaderState,
} from "../progress/BookAnchor"
import {
  buildTextChapterBookAnchorAtBoundary,
  epubReadingBoundaryFromChapterCharOffset,
} from "../progress/epubBookAnchor"
import { genericResolveInternalTextLink } from "./internalTextLink"
import {
  findPageIndexForReadingAnchor,
  layoutTextChapterAtMeasureHost,
  PAGINATION_DOUBLE_COLUMN_GAP_PX,
  ProgressivePaginator,
  readingAnchorForElement,
  renderTextChapterPage,
} from "./pagination/ProgressivePaginator"
import { ComicParser } from "./parsers/ComicParser"
import { EpubParser } from "./parsers/EpubParser"
import { PdfParser } from "./parsers/PdfParser"
import type {
  BookMetadata,
  ChapterData,
  ChapterInfo,
  IPaginator,
  IParser,
  LayoutConfig,
  LayoutMode,
  PageData,
  ParsedBook,
  RangeBoundary,
  ReaderProgress,
  ResolvedInternalTextLink,
  TextChapterData,
  TextChapterPaginationResult,
  TocItem,
} from "./types"
import { findHtmlFragmentElement } from "./utils"

/** 列页切片数 → 双栏下的跨页（屏）数。 */
function textSpreadCountFromColumns(columnPageCount: number): number {
  return Math.max(1, Math.ceil(Math.max(0, columnPageCount) / 2))
}

/** 跨页下标 → 该跨左栏的列页下标。 */
function spreadIndexToLeftColumn(
  spread: number,
  columnPageCount: number,
): number {
  if (columnPageCount <= 0) return 0
  return Math.min(2 * Math.max(0, spread), columnPageCount - 1)
}

/** 列页下标 → 所在跨页下标。 */
function columnPageIndexToSpread(columnPageIndex: number): number {
  return Math.max(0, Math.floor(columnPageIndex / 2))
}

/**
 * Headless reader state machine.
 *
 * 持有 parser、分页状态与章节导航；文本书分页视图的 DOM 经
 * {@link BookReader.renderPaginatedTextPage} 委托给分页实现。
 *
 * {@link curPage} / {@link prevPage} / {@link nextPage} 在导航键（章、偏移、章内总页、全书章数）
 * 不变时保持同一对象引用；键变化时替换为新对象，便于 React 等用 `Object.is` 触发更新。
 * 请勿修改返回的 {@link PageData}。
 *
 * 文本书分页视图的 DOM 绘制请使用 {@link BookReader.renderPaginatedTextPage}，由控制器统一委托分页实现。
 */
export class BookReader {
  private parser: IParser | null = null
  private paginator: IPaginator<any, PageData> | null = null
  private _book: ParsedBook | null = null
  private _currentIndex = 0
  private _layoutConfig: LayoutConfig | null = null
  private _currentPageOffset = 0
  private _totalPagesOfCurChapter = 1
  private _chapterStartFromEnd = false
  /** 下一首次成功切片分页后从章末打开（与 UI 层 `startFromEnd` 一次性语义一致） */
  private _openAtChapterEndPending = false
  /** After layout, open the column/page that contains this EPUB fragment id (NCX `id` / `name`). */
  private _pendingLinkFragment: string | null = null
  /** 文本书：由 {@link applyCharOffsetResume} 设置，首屏 layout 后对齐到章内偏移对应列页。 */
  private _pendingTextResumeBoundary: RangeBoundary | null = null
  /** 最近一次带 `sourceRoot` 的分页结果，供 EPUB 打包 CFI 锚点。 */
  private _lastTextLayout: {
    sourceRoot: HTMLDivElement
    chapter: TextChapterData
  } | null = null
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

  get book(): ParsedBook | null {
    return this._book ?? null
  }

  get ready(): boolean {
    return this._ready
  }

  get metadata(): BookMetadata {
    return this._book?.metadata ?? {}
  }

  get toc(): TocItem[] {
    return this._book?.toc ?? []
  }

  get chapters(): ChapterInfo[] {
    return this._book?.chapters ?? []
  }

  get totalChapters(): number {
    return this._book?.chapters.length ?? 0
  }

  /** 当前章节下标（与架构文档中的 curChapter 一致） */
  get curChapter(): number {
    return this._currentIndex
  }

  get currentIndex(): number {
    return this._currentIndex
  }

  get layoutMode(): LayoutMode {
    return this._book?.layoutMode ?? "unknown"
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
   * 若提供 `initialOpenAnchor`，首章与首屏 layout 即对应该锚点（避免先渲染第 1 章再跳转）。
   */
  async init(
    buffer: ArrayBuffer,
    format: string,
    options?: { initialOpenAnchor?: BookAnchor | null },
  ): Promise<ParsedBook> {
    this.parser = BookReader.createParser(format)
    this._book = await this.parser.parse(buffer)
    this.paginator =
      this._book.layoutMode === "reflowable" ? new ProgressivePaginator() : null

    this._pendingLinkFragment = null
    this._pendingTextResumeBoundary = null
    this._lastTextLayout = null
    this._chapterStartFromEnd = false
    this._openAtChapterEndPending = false

    const n = this.totalChapters
    const anchor = options?.initialOpenAnchor ?? null
    let chIdx = 0
    if (anchor && n > 0) {
      chIdx = Math.min(Math.max(0, Math.floor(anchor.chapterIndex)), n - 1)
    }

    if (
      this._book.layoutMode === "reflowable" &&
      anchor &&
      anchor.charOffset != null &&
      Number.isFinite(anchor.charOffset)
    ) {
      const ch = await this.getChapter(chIdx)
      if (ch.type === "text") {
        const boundary = epubReadingBoundaryFromChapterCharOffset(
          ch,
          Math.max(0, Math.floor(anchor.charOffset)),
        )
        if (boundary) {
          this._pendingTextResumeBoundary = boundary
        }
      }
    }

    this.gotoChapterWithResume(chIdx, 0)

    this._ready = true
    this.invalidatePageDescriptorCaches()
    return this._book
  }

  /**
   * Get the full chapter data for a given index (defaults to current).
   * Results are cached inside the parser.
   */
  async getChapter(index?: number): Promise<ChapterData> {
    if (!this.parser || !this._book) {
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
        const anchorBefore =
          this.paginator.getAllSlices().length > 0
            ? (this.paginator.getCurrentSlice()?.start ?? null)
            : null
        const result = await layoutTextChapterAtMeasureHost(
          ch,
          config,
          measureHost,
          this.paginator,
        )
        if (result.sourceRoot) {
          this._lastTextLayout = { sourceRoot: result.sourceRoot, chapter: ch }
        } else {
          this._lastTextLayout = null
        }

        const N = result.pages.length
        const maxCol = Math.max(0, N - 1)
        let nextCol = Math.min(this._currentPageOffset, maxCol)
        if (config.doubleColumn && N > 0) {
          nextCol = spreadIndexToLeftColumn(columnPageIndexToSpread(nextCol), N)
        }
        if (
          this._openAtChapterEndPending &&
          result.mode === "sliced" &&
          N > 0
        ) {
          const lastSpread = textSpreadCountFromColumns(N) - 1
          nextCol = spreadIndexToLeftColumn(lastSpread, N)
          this._openAtChapterEndPending = false
        } else if (
          this._pendingTextResumeBoundary &&
          result.mode === "sliced" &&
          N > 0 &&
          result.sourceRoot
        ) {
          const anchorCol = findPageIndexForReadingAnchor(
            result.sourceRoot,
            result.pages,
            this._pendingTextResumeBoundary,
          )
          const c = Math.max(0, Math.min(anchorCol, maxCol))
          const double = Boolean(config.doubleColumn)
          nextCol = double
            ? spreadIndexToLeftColumn(columnPageIndexToSpread(c), N)
            : c
          this._pendingTextResumeBoundary = null
        } else if (this._pendingTextResumeBoundary && result.mode === "full") {
          this._pendingTextResumeBoundary = null
        } else if (
          this._pendingLinkFragment &&
          result.mode === "sliced" &&
          N > 0 &&
          result.sourceRoot
        ) {
          const id = this._pendingLinkFragment
          this._pendingLinkFragment = null
          const el = findHtmlFragmentElement(result.sourceRoot, id)
          if (el) {
            const boundary = readingAnchorForElement(result.sourceRoot, el)
            const anchorCol = findPageIndexForReadingAnchor(
              result.sourceRoot,
              result.pages,
              boundary,
            )
            const c = Math.max(0, Math.min(anchorCol, maxCol))
            const double = Boolean(config.doubleColumn)
            nextCol = double
              ? spreadIndexToLeftColumn(columnPageIndexToSpread(c), N)
              : c
          }
        } else if (
          anchorBefore &&
          result.mode === "sliced" &&
          N > 0 &&
          result.sourceRoot
        ) {
          const anchorCol = findPageIndexForReadingAnchor(
            result.sourceRoot,
            result.pages,
            anchorBefore,
          )
          const c = Math.max(0, Math.min(anchorCol, maxCol))
          const double = Boolean(config.doubleColumn)
          nextCol = double
            ? spreadIndexToLeftColumn(columnPageIndexToSpread(c), N)
            : c
        } else if (this._pendingLinkFragment) {
          this._pendingLinkFragment = null
        }
        await this.paginator.gotoPage(nextCol)
        this.syncPageStateFromPaginator()
        return result
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
    this._openAtChapterEndPending = false
    this._pendingTextResumeBoundary = null
    this._lastTextLayout = null
    this.invalidatePageDescriptorCaches()
  }

  /**
   * 与 {@link gotoChapter} 相同，但可指定文本书恢复时的列页下标（首屏 layout 会据此对齐）。
   * 漫画/PDF 等一章一页时 `columnPageOffset` 忽略。
   */
  gotoChapterWithResume(index: number, columnPageOffset?: number): void {
    if (index < 0 || index >= this.totalChapters) return
    this._currentIndex = index
    const col =
      columnPageOffset != null && Number.isFinite(columnPageOffset)
        ? Math.max(0, Math.floor(columnPageOffset))
        : 0
    this._currentPageOffset = col
    this._totalPagesOfCurChapter = 1
    this._chapterStartFromEnd = false
    this._openAtChapterEndPending = false
    this._lastTextLayout = null
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
    this._openAtChapterEndPending = true
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
        const step =
          this._layoutConfig?.doubleColumn && slices.length > 0 ? 2 : 1
        const target = before + step
        if (target <= lastIdx) {
          await this.paginator.gotoPage(target)
          this.syncPageStateFromPaginator()
          return this.getChapter(this._currentIndex)
        }
        if (!this.nextChapter()) return null
        const ch = await this.getChapter(this._currentIndex)
        this._chapterStartFromEnd = false
        await this.paginator.clearCache()
        this._currentPageOffset = 0
        this._totalPagesOfCurChapter = 1
        this.invalidatePageDescriptorCaches()
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
        const step =
          this._layoutConfig?.doubleColumn && slices.length > 0 ? 2 : 1
        const target = before - step
        if (target >= 0) {
          await this.paginator.gotoPage(target)
          this.syncPageStateFromPaginator()
          return this.getChapter(this._currentIndex)
        }
        if (!this.prevChapter()) return null
        const ch = await this.getChapter(this._currentIndex)
        this._chapterStartFromEnd = true
        this._openAtChapterEndPending = true
        await this.paginator.clearCache()
        this._currentPageOffset = 0
        this._totalPagesOfCurChapter = 1
        this.invalidatePageDescriptorCaches()
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
    if (this.paginator) {
      await this.paginator.gotoPrevPage()
      if (this.paginator.curPage) {
        this.syncPageStateFromPaginator()
        return this.getChapter(this._currentIndex)
      }
      if (!this.prevChapter()) return null
      const ch = await this.getChapter(this._currentIndex)
      this._chapterStartFromEnd = true
      this._openAtChapterEndPending = true
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
    const clamped = Math.max(
      0,
      Math.min(pageOffset, this._totalPagesOfCurChapter - 1),
    )
    if (this.paginator instanceof ProgressivePaginator) {
      const N = this.paginator.getAllSlices().length
      let col = clamped
      if (this._layoutConfig?.doubleColumn && N > 0) {
        col = spreadIndexToLeftColumn(clamped, N)
      }
      void this.paginator.gotoPage(col)
      this._currentPageOffset = col
    } else {
      this._currentPageOffset = clamped
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
    const info = this._book?.chapters[this._currentIndex]
    return {
      chapterIndex: this._currentIndex,
      chapterTitle: info?.title ?? "",
      totalChapters: this.totalChapters,
    }
  }

  /**
   * 当前位置写入本地库用的 {@link BookAnchor}：文本书写章内 UTF-16 `charOffset` 与片段；否则仅章下标。
   */
  buildSaveBookAnchor(_fileFormat: string): BookAnchor {
    const chapterIdx = Math.max(0, this._currentIndex)
    if (
      this.layoutMode === "reflowable" &&
      this._lastTextLayout?.chapter.type === "text" &&
      this.paginator instanceof ProgressivePaginator
    ) {
      const { chapter } = this._lastTextLayout
      const slice = this.paginator.getCurrentSlice()
      const boundary: RangeBoundary = slice?.start ?? {
        path: [],
        offset: 0,
        isText: false,
      }
      return buildTextChapterBookAnchorAtBoundary({ chapter, boundary })
    }
    return bookAnchorFromReaderState({
      chapterIndex: chapterIdx,
    })
  }

  /**
   * 文本书：按章内 UTF-16 `charOffset`（相对该章 body 文本）在下一屏 layout 对齐列页。
   */
  async applyCharOffsetResume(
    chapterIndex: number,
    charOffset: number,
  ): Promise<boolean> {
    const ch = await this.getChapter(chapterIndex)
    if (ch.type !== "text") return false
    const boundary = epubReadingBoundaryFromChapterCharOffset(ch, charOffset)
    if (!boundary) return false
    this._pendingLinkFragment = null
    this._pendingTextResumeBoundary = boundary
    this.gotoChapterWithResume(chapterIndex, 0)
    if (this.paginator instanceof ProgressivePaginator) {
      void this.paginator.clearCache()
    }
    this.invalidatePageDescriptorCaches()
    return true
  }

  /**
   * Resolves an in-spine link from `fromChapterIndex` (footnote, multi-file HTML, etc.).
   * Uses the parser’s {@link IParser.resolveInternalLink} when present, otherwise spine `href` matching.
   */
  resolveInternalTextLink(
    fromChapterIndex: number,
    rawHref: string,
  ): ResolvedInternalTextLink | null {
    if (
      this._book?.layoutMode !== "reflowable" ||
      !this.parser ||
      !this._book
    ) {
      return null
    }
    const p = this.parser as IParser
    if (typeof p.resolveInternalLink === "function") {
      return p.resolveInternalLink(fromChapterIndex, rawHref)
    }
    return genericResolveInternalTextLink(
      this._book.chapters,
      fromChapterIndex,
      rawHref,
    )
  }

  /**
   * Applies spine navigation and optional fragment jump after the next progressive layout.
   */
  prepareInternalTextLinkNavigation(
    fromChapterIndex: number,
    rawHref: string,
  ): { chapterIndex: number } | null {
    const resolved = this.resolveInternalTextLink(fromChapterIndex, rawHref)
    if (!resolved) return null
    this._pendingLinkFragment = resolved.fragmentId
    this.gotoChapter(resolved.chapterIndex)
    this._currentPageOffset = 0
    this._totalPagesOfCurChapter = 1
    this._chapterStartFromEnd = false
    this._openAtChapterEndPending = false
    if (this.paginator instanceof ProgressivePaginator) {
      void this.paginator.clearCache()
    }
    this.invalidatePageDescriptorCaches()
    return { chapterIndex: resolved.chapterIndex }
  }

  destroy(): void {
    this.parser?.destroy()
    this.parser = null
    this._book = null
    this._ready = false
    this._currentIndex = 0
    this._layoutConfig = null
    this.paginator = null
    this._currentPageOffset = 0
    this._totalPagesOfCurChapter = 1
    this._chapterStartFromEnd = false
    this._openAtChapterEndPending = false
    this._pendingLinkFragment = null
    this._pendingTextResumeBoundary = null
    this._lastTextLayout = null
    this.invalidatePageDescriptorCaches()
  }

  static readonly PAGINATION_DOUBLE_COLUMN_GAP_PX =
    PAGINATION_DOUBLE_COLUMN_GAP_PX

  /**
   * 分页视口展示模型。
   * `twoColumnShell` 仅由宽屏决定，避免换章或重测期间因 `pages` 暂空先画单列再跳双列。
   * 切片与跨页进度仍由 `contentIsSliced` 判定。
   */
  static paginatedViewportModel(params: {
    /** 宽屏双栏壳（可与测量不同策略；通常与 layoutDoubleColumn 同源）。 */
    wideViewport: boolean
    /**
     * 须与 {@link LayoutConfig.doubleColumn} 一致。单列测量时禁用跨页取整，否则奇数列页会被映射成前一跨左栏导致无法翻页。
     */
    layoutDoubleColumn: boolean
    mode: TextChapterPaginationResult["mode"]
    columnSliceCount: number
    pageCountState: number
    pageOffset: number | undefined
  }): {
    twoColumnShell: boolean
    leftColumnIndex: number
    spreadIndex: number
    spreadCount: number
  } {
    const {
      wideViewport,
      layoutDoubleColumn,
      mode,
      columnSliceCount,
      pageCountState,
      pageOffset,
    } = params
    const twoColumnShell = wideViewport
    const contentIsSliced = mode === "sliced" && columnSliceCount > 0
    const max = Math.max(0, pageCountState - 1)
    const raw =
      typeof pageOffset === "number"
        ? Math.max(0, Math.min(pageOffset, max))
        : 0
    const leftColumnIndex =
      layoutDoubleColumn && contentIsSliced && pageCountState > 0
        ? spreadIndexToLeftColumn(columnPageIndexToSpread(raw), pageCountState)
        : raw
    const spreadCount =
      layoutDoubleColumn && contentIsSliced && columnSliceCount > 1
        ? textSpreadCountFromColumns(columnSliceCount)
        : Math.max(1, pageCountState)
    const spreadIndex =
      layoutDoubleColumn && contentIsSliced && columnSliceCount > 0
        ? columnPageIndexToSpread(leftColumnIndex)
        : leftColumnIndex
    return {
      twoColumnShell,
      leftColumnIndex,
      spreadIndex,
      spreadCount,
    }
  }

  /**
   * 绘制单列或双栏视口；宽屏双栏壳下 `left`/`right` 须已挂载（整章 mode=full 时只填左栏）。
   */
  static renderPaginatedViewport(
    elements: {
      single: HTMLElement | null
      left: HTMLElement | null
      right: HTMLElement | null
    },
    args: {
      chapter: TextChapterData
      mode: TextChapterPaginationResult["mode"]
      pages: TextChapterPaginationResult["pages"]
      leftColumnIndex: number
      sourceRoot: HTMLDivElement | null
      texts: Text[]
      twoColumnShell: boolean
    },
  ): void {
    const {
      chapter,
      mode,
      pages,
      leftColumnIndex,
      sourceRoot,
      texts,
      twoColumnShell,
    } = args
    if (twoColumnShell && elements.left && elements.right) {
      renderTextChapterPage(
        elements.left,
        chapter,
        mode,
        pages,
        leftColumnIndex,
        sourceRoot,
        texts,
      )
      const rightIdx = leftColumnIndex + 1
      if (rightIdx < pages.length) {
        renderTextChapterPage(
          elements.right,
          chapter,
          mode,
          pages,
          rightIdx,
          sourceRoot,
          texts,
        )
      } else {
        elements.right.replaceChildren()
      }
      return
    }
    if (elements.single) {
      renderTextChapterPage(
        elements.single,
        chapter,
        mode,
        pages,
        leftColumnIndex,
        sourceRoot,
        texts,
      )
    }
  }

  /**
   * 将文本书分页测量结果绘制到视口节点；具体切片逻辑由 ProgressivePaginator 实现。
   */
  static renderPaginatedTextPage(
    display: HTMLElement,
    chapter: TextChapterData,
    mode: TextChapterPaginationResult["mode"],
    pages: TextChapterPaginationResult["pages"],
    pageIndex: number,
    sourceRoot: HTMLDivElement | null,
    texts: Text[],
  ): void {
    renderTextChapterPage(
      display,
      chapter,
      mode,
      pages,
      pageIndex,
      sourceRoot,
      texts,
    )
  }

  /**
   * Builds page descriptor from当前列页下标；双栏时 `totalPages` 为跨页数 S，`index` 仍为列下标。
   */
  private makePage(
    chapter: number,
    columnIndex: number,
    columnPageCount: number,
  ): PageData {
    const double =
      Boolean(this._layoutConfig?.doubleColumn) && columnPageCount > 0
    let isEnd: boolean
    if (double) {
      const s = textSpreadCountFromColumns(columnPageCount)
      isEnd = columnPageIndexToSpread(columnIndex) >= s - 1
    } else {
      isEnd = columnIndex >= this._totalPagesOfCurChapter - 1
    }
    return {
      index: columnIndex,
      chapter,
      columns: [],
      isStartOfChapter: columnIndex === 0,
      isEndOfChapter: isEnd,
    }
  }

  private invalidatePageDescriptorCaches(): void {
    this._pageDescriptorKey = ""
  }

  private ensurePageDescriptorCaches(): void {
    const key = `${this._currentIndex}:${this._currentPageOffset}:${this._totalPagesOfCurChapter}:${this.totalChapters}`
    if (key === this._pageDescriptorKey) return
    this._pageDescriptorKey = key

    const progSlices =
      this.paginator instanceof ProgressivePaginator
        ? this.paginator.getAllSlices()
        : []
    const N = progSlices.length
    const double = Boolean(this._layoutConfig?.doubleColumn) && N > 0
    const step = double ? 2 : 1
    const maxCol = N > 0 ? N - 1 : Math.max(0, this._totalPagesOfCurChapter - 1)

    this._curPageCache = this.makePage(
      this._currentIndex,
      this._currentPageOffset,
      N,
    )

    this._prevPageCache =
      this._currentPageOffset >= step
        ? this.makePage(this._currentIndex, this._currentPageOffset - step, N)
        : this._currentIndex <= 0
          ? null
          : this.makePage(this._currentIndex - 1, 0, 0)

    this._nextPageCache =
      this._currentPageOffset + step <= maxCol
        ? this.makePage(this._currentIndex, this._currentPageOffset + step, N)
        : this._currentIndex >= this.totalChapters - 1
          ? null
          : this.makePage(this._currentIndex + 1, 0, 0)
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
    if (this.paginator instanceof ProgressivePaginator) {
      const slices = this.paginator.getAllSlices()
      const n = slices.length
      if (n > 0) {
        this._totalPagesOfCurChapter = this._layoutConfig?.doubleColumn
          ? textSpreadCountFromColumns(n)
          : Math.max(1, n)
      } else {
        const total = this.paginator.nextPage
          ? Math.max(
              this.paginator.nextPage.index + 1,
              this._currentPageOffset + 1,
            )
          : this._currentPageOffset + 1
        this._totalPagesOfCurChapter = Math.max(1, total)
      }
    } else {
      const total = this.paginator.nextPage
        ? Math.max(
            this.paginator.nextPage.index + 1,
            this._currentPageOffset + 1,
          )
        : this._currentPageOffset + 1
      this._totalPagesOfCurChapter = Math.max(1, total)
    }
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
