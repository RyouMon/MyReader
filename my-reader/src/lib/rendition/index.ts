// Headless book reader library
// No DOM, no styles, no iframes — just data + state.

export { BookReader } from "./BookReader"

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
