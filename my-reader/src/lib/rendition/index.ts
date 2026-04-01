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
  ImageChapterData,
  LayoutConfig,
  PageData,
  ParsedBook,
  ReaderProgress,
  TextChapterData,
  TocItem,
} from "./types"
