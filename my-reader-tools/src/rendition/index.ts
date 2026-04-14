// Headless book reader library
// Compatibility exports only; prefer reader-core/layout-engines for new code.

export { BookReader } from "./BookReader"
export { ReaderSession } from "../reader-core"
export { configurePdfJsWorker } from "./parsers/PdfParser"
export {
  PAGINATION_DOUBLE_COLUMN_GAP_PX,
  renderTextChapterPage,
  READER_TYPOGRAPHY_OVERRIDE_CSS,
  readingAnchorForElement,
  fillRangeStartFromBoundary,
  readingAnchorForRangeStart,
  findPageIndexForReadingAnchor,
} from "../layout-engines/reflow"

export { buildComicManifest, isComicImagePath } from "./parsers/comicManifest"

export type { ComicManifest, ComicPageEntry, ComicSpineItem } from "./parsers/comicManifest"

export type {
  BookMetadata,
  BookParser,
  BookSource,
  ChapterData,
  ChapterInfo,
  LayoutMode,
  DomPageSlice,
  ImageChapterData,
  IPaginator,
  IParser,
  LayoutConfig,
  PageData,
  ParsedBook,
  RangeBoundary,
  ReaderProgress,
  ReaderTypographyConfig,
  ResolvedInternalTextLink,
  TextChapterData,
  TextChapterPaginationResult,
  TocItem,
} from "./types"
