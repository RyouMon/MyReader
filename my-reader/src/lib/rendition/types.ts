// ─── Headless Book Reader Library ───
// Inspired by TanStack Table: parse-only, no rendering opinions.
// Consumers decide how to present chapters (React DOM, iframe, native, etc.)

export type ContentType = "text" | "image"

export interface TocItem {
  label: string
  href: string
  index: number
  subitems?: TocItem[]
}

export interface BookMetadata {
  title?: string
  author?: string
  description?: string
  publisher?: string
  language?: string
}

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

/** Lightweight chapter descriptor (no content loaded yet). */
export interface ChapterInfo {
  index: number
  title: string
  href: string
}

/** Full text chapter payload returned by `getChapter()`. */
export interface TextChapterData extends ChapterInfo {
  type: "text"
  /** Body inner-HTML with resolved resource URLs (images as blob URLs). */
  bodyHtml: string
  /** Combined CSS extracted from the chapter (for EPUB). */
  cssText: string
  /** Plain-text content for TTS / full-text search. */
  text: string
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

/**
 * 全书流式分页后的一屏数据（{@link paginateTextChapters}），
 * 在 {@link TextChapterData} 上增加全局页码与章内页序。
 */
export interface TextPageData extends TextChapterData {
  pageGlobalIndex: number
  totalPages: number
  pageInChapter: number
}

/** Single image page (for comic/PDF). */
export interface ImageChapterData extends ChapterInfo {
  type: "image"
  /** Blob URL for the page image. */
  imageUrl: string
}

/** Union of all chapter data variants. Discriminate on `type`. */
export type ChapterData = TextChapterData | ImageChapterData

/** Result of parsing a book file. */
export interface ParsedBook {
  metadata: BookMetadata
  toc: TocItem[]
  chapters: ChapterInfo[]
  contentType: ContentType
}

/** Progress snapshot. */
export interface ReaderProgress {
  chapterIndex: number
  chapterTitle: string
  totalChapters: number
}

/** Format-specific parser contract. */
export interface IParser {
  parse(buffer: ArrayBuffer): Promise<ParsedBook>
  getChapter(index: number): Promise<ChapterData>
  destroy(): void
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

export type BookParser = IParser
