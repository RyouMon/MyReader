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

export type {
  BookMetadata,
  BookParser,
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
