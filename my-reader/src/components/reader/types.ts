import type { ReaderThemeKey } from "@my-reader/tools/reader-themes"
import type { SpreadPreference } from "@/lib/readium/epubReaderPrefs"
import type { ReaderFontFamilyKey } from "@/lib/readium/readerFonts"

export type ReadingLayout = "paginate" | "scroll"
export type DisplayMode = "single" | "spread"
export type ZoomMode = "fit-height" | "fit-width" | "manual" | string
export type PageDirection = "ltr" | "rtl"
export type TextAlign = "auto" | "justify" | "start"
export type ColCount = "auto" | "1" | "2"

/** 与 Thorium 对齐的 8 个阅读主题。 */
export type ReaderTheme = ReaderThemeKey

export interface ReaderSettings {
  theme: ReaderTheme
  fontFamily: ReaderFontFamilyKey
  fontFamiliesByLanguage: Record<string, ReaderFontFamilyKey>
  fontSize: number
  lineHeight: number
  paddingX: number
  readingLayout: ReadingLayout
  textAlign: TextAlign
  colCount: ColCount
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: "paper",
  fontFamily: "default",
  fontFamiliesByLanguage: {},
  fontSize: 18,
  lineHeight: 1.85,
  paddingX: 2.5,
  readingLayout: "paginate",
  textAlign: "auto",
  colCount: "auto",
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
