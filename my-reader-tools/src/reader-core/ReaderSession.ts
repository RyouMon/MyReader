import { FixedLayoutEngine } from "../layout-engines/fixed/FixedLayoutEngine"
import type { FixedViewportState } from "../layout-engines/fixed/types"
import type { BookAnchor } from "../progress/BookAnchor"
import { ComicParser } from "../parsers/ComicParser"
import { EpubParser } from "../parsers/EpubParser"
import { PdfParser } from "../parsers/PdfParser"
import type {
  ChapterData,
  IParser,
  ParsedBook,
  ReaderProgress,
} from "../types"
import { NavigationController } from "./NavigationController"
import { ProgressController } from "./ProgressController"
import { ResourceCache } from "./ResourceCache"
import type {
  OpenBookRequest,
  OpenBookResult,
  ReaderSnapshot,
} from "./types"

export class ReaderSession {
  private parserInstance: IParser | null = null
  private parsedBook: ParsedBook | null = null
  private readyState = false
  private fixedLayoutEngine: FixedLayoutEngine | null = null
  private readonly navigation = new NavigationController()
  private readonly progress = new ProgressController()
  private readonly listeners = new Set<() => void>()

  readonly resourceCache = new ResourceCache<string, unknown>()

  get parser(): IParser | null {
    return this.parserInstance
  }

  get book(): ParsedBook | null {
    return this.parsedBook
  }

  get ready(): boolean {
    return this.readyState
  }

  get currentChapter(): number {
    return this.navigation.getSnapshot().currentChapter
  }

  get currentPageInChapter(): number {
    return this.navigation.getSnapshot().currentPageInChapter
  }

  get totalPagesInChapter(): number {
    return this.navigation.getSnapshot().totalPagesInChapter
  }

  get chapterStartFromEnd(): boolean {
    return this.navigation.getSnapshot().chapterStartFromEnd
  }

  async open(input: OpenBookRequest): Promise<OpenBookResult> {
    console.info("[reader-session] open:start", {
      format: input.format,
      filePath: input.source.filePath ?? null,
      extractedDirPath: input.source.extractedDirPath ?? null,
      initialOpenAnchor: input.initialOpenAnchor ?? null,
    })
    this.close()

    this.parserInstance = await ReaderSession.createParser(input.format)
    console.info("[reader-session] open:parser-created", {
      format: input.format,
      parser: this.parserInstance.constructor.name,
    })
    this.parsedBook = await this.parserInstance.parse(input.source)
    this.readyState = true

    console.info("[reader-session] open:parsed", {
      layoutMode: this.parsedBook.layoutMode,
      chapterCount: this.parsedBook.chapters.length,
      tocCount: this.parsedBook.toc.length,
      metadata: this.parsedBook.metadata,
    })

    const totalChapters = this.parsedBook.chapters.length
    const initialChapter = input.initialOpenAnchor
      ? Math.min(
          Math.max(0, Math.floor(input.initialOpenAnchor.chapterIndex)),
          Math.max(0, totalChapters - 1),
        )
      : 0

    this.navigation.gotoChapterWithResume(initialChapter, totalChapters, 0)

    console.info("[reader-session] open:initial-navigation", {
      totalChapters,
      initialChapter,
    })

    if (this.parsedBook.layoutMode === "fixedLayout" && this.parserInstance) {
      const parser = this.parserInstance
      console.info("[reader-session] open:fixed-layout-engine:create", {
        chapterCount: this.parsedBook.chapters.length,
      })
      this.fixedLayoutEngine = new FixedLayoutEngine(async (i) => {
        console.info("[reader-session] fixed-layout-engine:load-page", {
          index: i,
        })
        const ch = await parser.getChapter(i)
        if (ch.type !== "image") {
          throw new Error("Fixed layout book expected image chapter data")
        }
        console.info("[reader-session] fixed-layout-engine:page-ready", {
          index: i,
          title: ch.title,
          imageUrlPrefix: ch.imageUrl.slice(0, 64),
        })
        return ch
      })
    }

    this.emit()
    this.touchFixedPrefetch()

    return {
      book: this.parsedBook,
      snapshot: this.getSnapshot(input.initialOpenAnchor ?? null),
    }
  }

  close(): void {
    console.info("[reader-session] close", {
      hadParser: Boolean(this.parserInstance),
      hadBook: Boolean(this.parsedBook),
      hadFixedLayoutEngine: Boolean(this.fixedLayoutEngine),
    })
    this.fixedLayoutEngine?.clear()
    this.fixedLayoutEngine = null
    this.parserInstance?.destroy()
    this.parserInstance = null
    this.parsedBook = null
    this.readyState = false
    this.navigation.reset()
    this.resourceCache.clear()
    this.emit()
  }

  getSnapshot(currentAnchor: BookAnchor | null = null): ReaderSnapshot {
    const book = this.parsedBook
    const navigation = this.navigation.getSnapshot()
    return {
      ready: this.readyState,
      loading: false,
      error: null,
      layoutMode: book?.layoutMode ?? "unknown",
      totalChapters: book?.chapters.length ?? 0,
      toc: book?.toc ?? [],
      currentChapter: navigation.currentChapter,
      currentPageInChapter: navigation.currentPageInChapter,
      totalPagesInChapter: navigation.totalPagesInChapter,
      progress: this.getProgress(),
      currentAnchor,
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async getChapter(index = this.currentChapter): Promise<ChapterData> {
    if (!this.parserInstance || !this.parsedBook) {
      throw new Error("Reader not initialized - call open() first")
    }
    if (index < 0 || index >= this.parsedBook.chapters.length) {
      throw new Error(`Chapter index out of range: ${index}`)
    }
    console.info("[reader-session] get-chapter:start", {
      index,
      currentChapter: this.currentChapter,
      usesFixedLayoutEngine: Boolean(this.fixedLayoutEngine),
    })
    if (this.fixedLayoutEngine) {
      const ch = await this.fixedLayoutEngine.getFixedPage(index)
      console.info("[reader-session] get-chapter:fixed-ready", {
        index,
        type: ch.type,
        title: ch.title,
      })
      return ch
    }
    const ch = await this.parserInstance.getChapter(index)
    console.info("[reader-session] get-chapter:parser-ready", {
      index,
      type: ch.type,
      title: ch.title,
    })
    return ch
  }

  getFixedViewportState(): FixedViewportState | null {
    if (!this.fixedLayoutEngine || !this.parsedBook) return null
    return this.fixedLayoutEngine.getViewportState(
      this.currentChapter,
      this.parsedBook.chapters.length,
    )
  }

  gotoChapter(index: number): boolean {
    const changed = this.navigation.gotoChapter(index, this.totalChapters())
    if (changed) {
      this.touchFixedPrefetch()
      this.emit()
    }
    return changed
  }

  gotoChapterWithResume(index: number, columnPageOffset = 0): boolean {
    const changed = this.navigation.gotoChapterWithResume(
      index,
      this.totalChapters(),
      columnPageOffset,
    )
    if (changed) {
      this.touchFixedPrefetch()
      this.emit()
    }
    return changed
  }

  gotoChapterFromEnd(index: number): boolean {
    const changed = this.navigation.gotoChapterFromEnd(index, this.totalChapters())
    if (changed) {
      this.touchFixedPrefetch()
      this.emit()
    }
    return changed
  }

  gotoPageInChapter(offset: number): boolean {
    if (!this.parsedBook) return false
    this.navigation.gotoPageInChapter(this.totalPagesInChapter, offset)
    this.emit()
    return true
  }

  gotoNext(): boolean {
    const navigation = this.navigation.getSnapshot()
    if (navigation.currentPageInChapter < navigation.totalPagesInChapter - 1) {
      this.navigation.gotoPageInChapter(
        navigation.totalPagesInChapter,
        navigation.currentPageInChapter + 1,
      )
      this.touchFixedPrefetch()
      this.emit()
      return true
    }
    const changed = this.navigation.nextChapter(this.totalChapters())
    if (changed) {
      this.touchFixedPrefetch()
      this.emit()
    }
    return changed
  }

  gotoPrev(): boolean {
    const navigation = this.navigation.getSnapshot()
    if (navigation.currentPageInChapter > 0) {
      this.navigation.gotoPageInChapter(
        navigation.totalPagesInChapter,
        navigation.currentPageInChapter - 1,
      )
      this.touchFixedPrefetch()
      this.emit()
      return true
    }
    const changed = this.navigation.prevChapter(this.totalChapters())
    if (changed) {
      this.touchFixedPrefetch()
      this.emit()
    }
    return changed
  }

  nextChapter(): boolean {
    const changed = this.navigation.nextChapter(this.totalChapters())
    if (changed) {
      this.touchFixedPrefetch()
      this.emit()
    }
    return changed
  }

  prevChapter(): boolean {
    const changed = this.navigation.prevChapter(this.totalChapters())
    if (changed) {
      this.touchFixedPrefetch()
      this.emit()
    }
    return changed
  }

  setCurrentChapter(index: number): void {
    this.navigation.setCurrentChapter(index)
    this.touchFixedPrefetch()
    this.emit()
  }

  setCurrentPageInChapter(offset: number): void {
    this.navigation.setCurrentPageInChapter(offset)
    this.emit()
  }

  setTotalPagesInChapter(totalPages: number): void {
    this.navigation.setTotalPagesInChapter(totalPages)
    this.emit()
  }

  setChapterStartFromEnd(value: boolean): void {
    this.navigation.setChapterStartFromEnd(value)
    this.emit()
  }

  getProgress(inChapterFraction?: number): ReaderProgress {
    const chapters = this.parsedBook?.chapters ?? []
    const fallbackFraction =
      this.totalPagesInChapter > 1
        ? this.currentPageInChapter / Math.max(1, this.totalPagesInChapter - 1)
        : 0

    return this.progress.getProgress({
      chapters,
      currentChapter: this.currentChapter,
      inChapterFraction:
        inChapterFraction != null ? inChapterFraction : fallbackFraction,
    })
  }

  prefetchAroundCurrent(): Promise<void> {
    this.touchFixedPrefetch()
    return Promise.resolve()
  }

  prefetchFixedPageIndices(indices: readonly number[]): void {
    if (!this.fixedLayoutEngine || !this.parsedBook) return
    this.fixedLayoutEngine.prefetchFixedPages(
      indices,
      this.parsedBook.chapters.length,
    )
  }

  private touchFixedPrefetch(): void {
    if (!this.fixedLayoutEngine || !this.parsedBook) return
    this.fixedLayoutEngine.prefetchFixedPagesAround(
      this.currentChapter,
      this.parsedBook.chapters.length,
    )
  }

  private totalChapters(): number {
    return this.parsedBook?.chapters.length ?? 0
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private static async createParser(format: string): Promise<IParser> {
    console.info("[reader-session] create-parser", { format })
    switch (format.toUpperCase()) {
      case "EPUB": {
        return new EpubParser()
      }
      case "CBZ":
        return new ComicParser()
      case "CBR":
        throw new Error(
          "CBR（RAR 压缩）暂不支持客户端解压，请将漫画转为 CBZ（ZIP）后在书库中阅读。",
        )
      case "PDF": {
        return new PdfParser()
      }
      default:
        throw new Error(`Unsupported format: ${format}`)
    }
  }
}
