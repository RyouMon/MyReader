import type { ChapterData, TextChapterData } from "./reader"

/** Reader layout config shared by paginator implementations. */
export interface LayoutConfig {
  fontFamily: string
  fontSize: number
  viewPortHeight: number
  viewPortWidth: number
  paddingX: number
  lineHeight: number | string
  doubleColumn?: boolean
}

/** 流式正文分页时的版心参数（与测量容器一致）。 */
export interface TextLayoutSpec {
  widthPx: number
  heightPx: number
  paddingXPx: number
  fontFamily: string
  fontSizePx: number
  lineHeight: number | string
}

/** Single page payload in paginator output. */
export interface PageData {
  index: number
  chapter: number
  columns: string[]
  isStartOfChapter: boolean
  isEndOfChapter: boolean
}

/** Range boundary serialized relative to the sliced content root (progressive paginator). */
export interface RangeBoundary {
  path: number[]
  offset: number
  isText: boolean
}

/** Page slice described by DOM start/end boundaries (progressive paginator). */
export interface DomPageSlice {
  start: RangeBoundary
  end: RangeBoundary
}

/** Reader typography values applied to source and measure roots. */
export interface ReaderTypographyConfig {
  fontFamily: string
  fontSize: number
  lineHeight: number | string
  paddingX: number
}

/** Pagination result returned to the React reader shell (progressive DOM layout). */
export interface TextChapterPaginationResult {
  mode: "sliced" | "full"
  pages: DomPageSlice[]
  pageCount: number
  sourceRoot: HTMLDivElement | null
  texts: Text[]
}

/**
 * 全书流式分页后的一屏数据（{@link paginateTextChapters}），
 * 在 {@link TextChapterData} 上增加全局页码与章内页序。
 */
export interface TextPageData extends TextChapterData {
  pageGlobalIndex: number
  totalPages: number
  pageInChapter: number
}

/** Paginator contract that stays renderer-agnostic. */
export interface IPaginator<TChapter = ChapterData, TPage = PageData> {
  layout(content: TChapter, config: LayoutConfig): Promise<void>
  gotoPage(offset: number): Promise<void>
  gotoNextPage(): Promise<void>
  gotoPrevPage(): Promise<void>
  clearCache(): Promise<void>
  readonly curPage: TPage | null
  readonly prevPage: TPage | null
  readonly nextPage: TPage | null
}
