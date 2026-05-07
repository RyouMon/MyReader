import type { ReaderSettings, ReaderTheme } from "@/components/reader/types"
import { EpubPreferences } from "@readium/navigator"
import {
  epubPreferencesForReflowTheme,
  type ReflowThemePreset,
} from "@/lib/readium/epubReaderPrefs"

const READIUM_FONT_SCALE_MIN = 0.7
const READIUM_FONT_SCALE_MAX = 4
const READIUM_LINE_HEIGHT_MIN = 1
const READIUM_LINE_HEIGHT_MAX = 2

/** 将 UI 字号（px，约等于 CSS px）映射到 Readium `fontSize` 缩放系数。 */
export function readerFontSizePxToReadiumScale(px: number): number {
  const raw = px / 16
  return Math.min(
    READIUM_FONT_SCALE_MAX,
    Math.max(READIUM_FONT_SCALE_MIN, Math.round(raw * 100) / 100),
  )
}

export function readerThemeToReflowPreset(theme: ReaderTheme): ReflowThemePreset {
  if (theme === "paper" || theme === "sepia" || theme === "dark") return theme
  return "paper"
}

/** 将已持久化的 `ReaderSettings` 转为提交给 `EpubNavigator` 的偏好。 */
export function readerSettingsToEpubPreferences(settings: ReaderSettings): EpubPreferences {
  const preset = readerThemeToReflowPreset(settings.theme)
  const base = epubPreferencesForReflowTheme(preset)
  const lh = Math.min(
    READIUM_LINE_HEIGHT_MAX,
    Math.max(READIUM_LINE_HEIGHT_MIN, Math.round(settings.lineHeight * 10) / 10),
  )
  const gutter = Math.round(Math.min(56, Math.max(4, 6 + settings.paddingX * 10)))

  return new EpubPreferences({
    backgroundColor: base.backgroundColor,
    textColor: base.textColor,
    fontFamily: settings.fontFamily,
    fontSize: readerFontSizePxToReadiumScale(settings.fontSize),
    lineHeight: lh,
    scroll: settings.readingLayout === "scroll",
    pageGutter: gutter,
  })
}
