import type {
  DomPageSlice,
  IPaginator,
  LayoutConfig,
  PageData,
  RangeBoundary,
  TextChapterData,
} from "../types"

interface ProgressivePaginatorInput {
  chapter: TextChapterData
  pages: DomPageSlice[]
}

function serializeBoundaryForDebug(boundary: RangeBoundary): string {
  const path = boundary.path.join(".")
  const kind = boundary.isText ? "t" : "n"
  return `${kind}:${path}:${boundary.offset}`
}

/** Progressive paginator over precomputed page slices. */
export class ProgressivePaginator
  implements IPaginator<ProgressivePaginatorInput, PageData>
{
  private pages: DomPageSlice[] = []
  private currentOffset = 0
  private chapter: TextChapterData | null = null

  curPage: PageData | null = null
  prevPage: PageData | null = null
  nextPage: PageData | null = null

  /** Hydrates the paginator with precomputed page boundaries. */
  async layout(
    content: ProgressivePaginatorInput,
    _config: LayoutConfig,
  ): Promise<void> {
    this.chapter = content.chapter
    this.pages = content.pages
    this.currentOffset = 0
    this.syncPointers()
  }

  /** Moves to an in-chapter page offset. */
  async gotoPage(offset: number): Promise<void> {
    if (this.pages.length <= 0) return
    this.currentOffset = Math.max(0, Math.min(offset, this.pages.length - 1))
    this.syncPointers()
  }

  /** Advances one page when possible. */
  async gotoNextPage(): Promise<void> {
    await this.gotoPage(this.currentOffset + 1)
  }

  /** Moves back one page when possible. */
  async gotoPrevPage(): Promise<void> {
    await this.gotoPage(this.currentOffset - 1)
  }

  /** Drops all cached page boundaries and page pointers. */
  async clearCache(): Promise<void> {
    this.pages = []
    this.chapter = null
    this.currentOffset = 0
    this.curPage = null
    this.prevPage = null
    this.nextPage = null
  }

  /** Returns the current page slice. */
  getCurrentSlice(): DomPageSlice | null {
    if (this.pages.length <= 0) return null
    return this.pages[this.currentOffset] ?? null
  }

  /** Returns all measured slices for the current chapter. */
  getAllSlices(): DomPageSlice[] {
    return this.pages
  }

  /** Synchronizes public page pointers from the internal offset. */
  private syncPointers(): void {
    this.curPage = this.buildPage(this.currentOffset)
    this.prevPage = this.buildPage(this.currentOffset - 1)
    this.nextPage = this.buildPage(this.currentOffset + 1)
  }

  /** Builds a stable page descriptor for the requested page offset. */
  private buildPage(offset: number): PageData | null {
    if (!this.chapter) return null
    const slice = this.pages[offset]
    if (!slice) return null
    return {
      index: offset,
      chapter: this.chapter.index,
      columns: [
        serializeBoundaryForDebug(slice.start),
        serializeBoundaryForDebug(slice.end),
      ],
      isStartOfChapter: offset === 0,
      isEndOfChapter: offset === this.pages.length - 1,
    }
  }
}

export {
  PAGINATION_DOUBLE_COLUMN_GAP_PX,
  layoutTextChapterAtMeasureHost,
  DomReflowEngine,
  defaultDomReflowEngine,
} from "../layout-engines/reflow/DomReflowEngine"
export {
  renderTextChapterPage,
  READER_TYPOGRAPHY_OVERRIDE_CSS,
} from "../layout-engines/reflow/DomSliceRenderer"
export {
  readingAnchorForElement,
  fillRangeStartFromBoundary,
  readingAnchorForRangeStart,
  findPageIndexForReadingAnchor,
} from "../layout-engines/reflow/DomBoundaryMapper"
