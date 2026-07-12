import type { Locator } from "@my-reader/readium"
import type { ReaderTocItem as SharedReaderTocItem } from "@my-reader/tools/reader-toc"

export type ReaderState = {
  ready: boolean
  currentPage: number
  totalPages: number
  progress: number
  chapterTitle: string
  loading: boolean
  error: string | null
  canGoPrev?: boolean
  canGoNext?: boolean
  /** 当前阅读位置（Readium {@link Locator}），用于进度保存与恢复。 */
  locator?: Locator
}

export type ReaderTocItem = SharedReaderTocItem
