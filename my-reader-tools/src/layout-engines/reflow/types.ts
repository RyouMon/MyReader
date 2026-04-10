import type {
  DomPageSlice,
  LayoutConfig,
  PageData,
  RangeBoundary,
  TextChapterData,
  TextChapterPaginationResult,
  IPaginator,
} from "../../rendition/types"

export type ReflowLayoutResult = TextChapterPaginationResult

export interface DomReflowLayoutOptions {
  measureHost: HTMLDivElement
  paginator: IPaginator<
    { chapter: TextChapterData; pages: DomPageSlice[] },
    PageData
  >
}

export interface ReflowLayoutEngine {
  layoutChapter(
    chapter: TextChapterData,
    config: LayoutConfig,
    options: DomReflowLayoutOptions,
  ): Promise<ReflowLayoutResult>
}

export interface PaginatedViewportModel {
  twoColumnShell: boolean
  leftColumnIndex: number
  spreadIndex: number
  spreadCount: number
}

export interface PaginatedViewportModelInput {
  wideViewport: boolean
  layoutDoubleColumn: boolean
  mode: ReflowLayoutResult["mode"]
  columnSliceCount: number
  pageCountState: number
  pageOffset: number | undefined
}

export interface PaginatedViewportElements {
  single: HTMLElement | null
  left: HTMLElement | null
  right: HTMLElement | null
}

export interface PaginatedViewportRenderArgs {
  chapter: TextChapterData
  mode: ReflowLayoutResult["mode"]
  pages: DomPageSlice[]
  leftColumnIndex: number
  sourceRoot: HTMLDivElement | null
  texts: Text[]
  twoColumnShell: boolean
}

export type { RangeBoundary }
