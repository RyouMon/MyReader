import type { BookAnchor } from "my-reader-tools/progress/BookAnchor";

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
  anchor?: BookAnchor;
};

export type ReaderTocItem = {
  id: string;
  label: string;
  pageIndex: number;
  chapterIndex?: number;
  href?: string;
};
