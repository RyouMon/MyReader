import type { Locator } from "@my-reader/readium";

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
  /** 当前阅读位置（Readium {@link Locator}），用于进度保存与恢复。 */
  locator?: Locator;
};

export type ReaderTocItem = {
  id: string;
  label: string;
  pageIndex: number;
  chapterIndex?: number;
  href?: string;
  /** 目录项对应的首个 position {@link Locator}，用于 `goTo`（优先于 href 匹配）。 */
  locator?: Locator;
};
