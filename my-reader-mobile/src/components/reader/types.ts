import type { BookAnchor } from "my-reader-tools/progress/BookAnchor";
import type { Locator } from "react-native-readium";

/**
 * EPUB 重排阅读器使用 Readium Locator；PDF/CBZ 固定版式使用 BookAnchor。
 * DB 层统一以 opaque JSON 字符串存储，无需协议变更。
 */
export type ReadingProgressAnchor = BookAnchor | Locator;

export type ReaderState = {
  ready: boolean;
  currentPage: number;
  totalPages: number;
  progress: number;
  chapterTitle: string;
  loading: boolean;
  error: string | null;
  canGoPrev?: boolean;
  canGoNext?: boolean;
  /** 当前阅读位置的精确锚点，用于进度保存与恢复。 */
  anchor?: ReadingProgressAnchor;
};

export type ReaderTocItem = {
  id: string;
  label: string;
  pageIndex: number;
  chapterIndex?: number;
  href?: string;
  /** Readium：目录项对应的首个 position，用于 `goTo`（优先于 href 匹配）。 */
  locator?: Locator;
};
