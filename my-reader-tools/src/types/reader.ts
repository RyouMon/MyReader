// ─── Headless Book Reader Library ───
// Inspired by TanStack Table: parse-only, no rendering opinions.
// Consumers decide how to present chapters (React DOM, iframe, native, etc.)

export type LayoutMode = "reflowable" | "fixedLayout" | "unknown"

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

/** Lightweight chapter descriptor (no content loaded yet). */
export interface ChapterInfo {
  index: number
  title: string
  href: string
  /**
   * 用于全书进度加权的体量：EPUB 为 spine 文档 **body 正文 UTF-16 字符数**；漫画/PDF 等固定版式为每页 **1**。
   * 缺省或全为 0 时 {@link BookReader.getProgress} 退化为均分权重。
   */
  contentWeight?: number
}

/**
 * `getChapter()` 返回的完整文本章载荷；继承 {@link ChapterInfo} 的 `contentWeight`（与 `ParsedBook.chapters` 同索引一致，由解析器写入）。
 */
export interface TextChapterData extends ChapterInfo {
  type: "text"
  /**
   * OPF 包内该 spine 项的文档级 CFI 前缀（foliate 解析）；与 `bodyHtml` 同构的独立 XHTML 文档上生成的局部 CFI 可与之拼接为全书 CFI。
   */
  spinePackageCfi?: string
  /** Body inner-HTML with resolved resource URLs (images as blob URLs). */
  bodyHtml: string
  /** Combined CSS extracted from the chapter (for EPUB). */
  cssText: string
  /** Plain-text content for TTS / full-text search. */
  text: string
  /**
   * `body` 子树 `textContent` 的 UTF-16 长度，与章内锚点 `charOffset` 同语义；
   * 用于按实际正文长度计算章内阅读比例。
   */
  bodyUtf16Length?: number
}

/**
 * 漫画/PDF 单页载荷；继承 `contentWeight`（固定版式一般为 1，与 `ParsedBook.chapters` 同索引一致）。
 */
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
  layoutMode: LayoutMode
}

/**
 * Unified reader input source.
 *
 * - `filePath`: original book file path/URL (e.g. PDF read via pathIO).
 * - `extractedDirPath`: native extracted directory root for ZIP-based formats (EPUB).
 * - `extractedEntries`: optional extracted relative file list (used by CBZ manifest build).
 */
export interface BookSource {
  filePath?: string
  extractedDirPath?: string
  extractedEntries?: string[]
}

/** Progress snapshot. */
export interface ReaderProgress {
  chapterIndex: number
  chapterTitle: string
  totalChapters: number
  /**
   * 全书阅读进度 0..1：按各章 {@link ChapterInfo.contentWeight} 加权，
   * 章内按 UTF-16 字符位置（流式）或页位置（固定版式）细分。
   */
  fraction: number
}

/** Target of an in-book `<a href>` (same or other spine chapter + optional fragment). */
export interface ResolvedInternalTextLink {
  chapterIndex: number
  fragmentId: string | null
}

/** Format-specific parser contract. */
export interface IParser {
  parse(source: BookSource): Promise<ParsedBook>
  getChapter(index: number): Promise<ChapterData>
  destroy(): void
  /**
   * Optional: resolve internal links using format-specific rules (e.g. EPUB OPF).
   * If omitted, {@link BookReader} falls back to spine `href` + relative path matching.
   */
  resolveInternalLink?(
    fromChapterIndex: number,
    rawHref: string,
  ): ResolvedInternalTextLink | null
}

export type BookParser = IParser
