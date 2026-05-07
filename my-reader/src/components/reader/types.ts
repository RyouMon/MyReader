import type { SpreadPreference } from "@/lib/readium/epubReaderPrefs"

export type ReadingLayout = "paginate" | "scroll"
export type DisplayMode = "single" | "spread"
export type ZoomMode = "fit-height" | "fit-width" | "manual" | string
export type PageDirection = "ltr" | "rtl"
export type ReaderTheme = "paper" | "dark" | "sepia" | string

export interface ReaderSettings {
  theme: ReaderTheme
  fontFamily: string
  fontSize: number
  lineHeight: number
  paddingX: number
  readingLayout: ReadingLayout
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: "paper",
  fontFamily: "'Lora', 'Noto Serif SC', serif",
  fontSize: 18,
  lineHeight: 1.85,
  paddingX: 2.5,
  readingLayout: "paginate",
}

export interface FixedLayoutSettings {
  readingLayout: ReadingLayout
  displayMode: DisplayMode
  /** 固定版面双页策略（持久化，对齐 Thorium 式「阅读偏好」集中存储）。 */
  spreadMode: SpreadPreference
  zoomMode: ZoomMode
  direction: PageDirection
  brightness: number
  pageGap: number
}

export const DEFAULT_FIXED_LAYOUT_SETTINGS: FixedLayoutSettings = {
  readingLayout: "paginate",
  displayMode: "single",
  spreadMode: "auto",
  zoomMode: "fit-height",
  direction: "ltr",
  brightness: 100,
  pageGap: 16,
}
