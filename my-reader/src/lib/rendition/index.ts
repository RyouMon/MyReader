// Headless book reader library
// No DOM, no styles, no iframes — just data + state.

export { BookReader } from "./BookReader"

export type {
  BookMetadata,
  BookParser,
  IParser,
  IPaginator,
  ChapterData,
  ChapterInfo,
  ContentType,
  DomPageSlice,
  ImageChapterData,
  LayoutConfig,
  PageData,
  ParsedBook,
  RangeBoundary,
  ReaderProgress,
  ReaderTypographyConfig,
  TextChapterData,
  TextChapterPaginationResult,
  TocItem,
} from "./types"
