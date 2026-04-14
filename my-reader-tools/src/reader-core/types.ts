import type { BookAnchor } from "../progress/BookAnchor"
import type {
  BookSource,
  LayoutMode,
  ParsedBook,
  ReaderProgress,
  TocItem,
} from "../types"

export interface OpenBookRequest {
  source: BookSource
  format: string
  initialOpenAnchor?: BookAnchor | null
}

export interface ReaderSnapshot {
  ready: boolean
  loading: boolean
  error: string | null
  layoutMode: LayoutMode
  totalChapters: number
  toc: TocItem[]
  currentChapter: number
  currentPageInChapter: number
  totalPagesInChapter: number
  progress: ReaderProgress
  currentAnchor: BookAnchor | null
}

export interface OpenBookResult {
  book: ParsedBook
  snapshot: ReaderSnapshot
}

export interface ReaderNavigationState {
  currentChapter: number
  currentPageInChapter: number
  totalPagesInChapter: number
  chapterStartFromEnd: boolean
}
