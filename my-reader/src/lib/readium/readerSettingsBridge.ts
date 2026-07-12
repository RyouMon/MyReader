import { isReaderThemeKey } from "@my-reader/tools/reader-themes"
import { EpubPreferences, TextAlignment } from "@readium/navigator"
import type { ReaderSettings, ReaderTheme } from "@/components/reader/types"
import {
  epubPreferencesForReflowTheme,
  type ReflowThemePreset,
} from "@/lib/readium/epubReaderPrefs"
import {
  resolveReaderFont,
  toReadiumFontFamily,
} from "@/lib/readium/readerFonts"

const READIUM_FONT_SCALE_MIN = 0.7
const READIUM_FONT_SCALE_MAX = 4
const READIUM_LINE_HEIGHT_MIN = 1
const READIUM_LINE_HEIGHT_MAX = 2
const READER_INLINE_PADDING_BASE_PX = 20
const READER_INLINE_PADDING_STEP_PX = 10
const READER_INLINE_PADDING_MAX_PX = 60

/** 将 UI 字号（px，约等于 CSS px）映射到 Readium `fontSize` 缩放系数。 */
export function readerFontSizePxToReadiumScale(px: number): number {
  const raw = px / 16
  return Math.min(
    READIUM_FONT_SCALE_MAX,
    Math.max(READIUM_FONT_SCALE_MIN, Math.round(raw * 100) / 100),
  )
}

export function readerThemeToReflowPreset(
  theme: ReaderTheme,
): ReflowThemePreset {
  if (isReaderThemeKey(theme)) return theme
  return "paper"
}

function uiTextAlignToReadium(align: string): TextAlignment | undefined {
  if (align === "justify") return TextAlignment.justify
  if (align === "start") return TextAlignment.start
  return undefined
}

function uiColCountToReadium(colCount: string): number | null {
  if (colCount === "1") return 1
  if (colCount === "2") return 2
  return null
}

export function readerPaddingXToInlinePaddingPx(paddingX: number): number {
  const extra = Number.isFinite(paddingX)
    ? Math.max(0, paddingX) * READER_INLINE_PADDING_STEP_PX
    : 0
  return Math.round(
    Math.min(
      READER_INLINE_PADDING_MAX_PX,
      READER_INLINE_PADDING_BASE_PX + extra,
    ),
  )
}

/** 将已持久化的 `ReaderSettings` 转为提交给 `EpubNavigator` 的偏好。 */
export function readerSettingsToEpubPreferences(
  settings: ReaderSettings,
  language?: string,
): EpubPreferences {
  const preset = readerThemeToReflowPreset(settings.theme)
  const base = epubPreferencesForReflowTheme(preset)
  const lh = Math.min(
    READIUM_LINE_HEIGHT_MAX,
    Math.max(
      READIUM_LINE_HEIGHT_MIN,
      Math.round(settings.lineHeight * 10) / 10,
    ),
  )
  const gutter = readerPaddingXToInlinePaddingPx(settings.paddingX)

  const fontFamily = toReadiumFontFamily(resolveReaderFont(language, settings))

  return new EpubPreferences({
    backgroundColor: base.backgroundColor,
    textColor: base.textColor,
    fontFamily,
    fontSize: readerFontSizePxToReadiumScale(settings.fontSize),
    lineHeight: lh,
    scroll: settings.readingLayout === "scroll",
    pageGutter: gutter,
    textAlign: uiTextAlignToReadium(settings.textAlign),
    columnCount: uiColCountToReadium(settings.colCount),
    optimalLineLength: 35,
    maximalLineLength:
      settings.colCount === "auto"
        ? 9999
        : settings.colCount === "1"
          ? null
          : undefined,
  })
}
