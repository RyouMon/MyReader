import type { Preferences } from "@my-reader/readium"

import { READER_THEMES } from "@/src/design/reader-tokens"
import type {
  ColumnCount,
  FontFamilyKey,
  ReaderTheme,
  TextAlignment,
} from "@/src/store/app-store.types"

/**
 * Readium `Preferences.theme` 使用 light / dark / sepia（见库类型定义）。
 */
export function toReadiumThemeToken(
  theme: ReaderTheme,
): "light" | "dark" | "sepia" {
  switch (theme) {
    case "night":
    case "contrast2":
      return "dark"
    case "paper":
    case "sepia":
    case "green":
    case "ocean":
    case "contrast1":
      return "sepia"
    default:
      return "light"
  }
}

export function buildPreferences(
  theme: ReaderTheme,
  fontFamily: FontFamilyKey,
  fontSize: number,
  lineHeight: number,
  paddingX: number,
  textAlign: TextAlignment,
  columnCount: ColumnCount,
): Preferences {
  const t = READER_THEMES[theme] ?? READER_THEMES.neutral
  const prefs: Preferences = {
    theme: toReadiumThemeToken(theme),
    fontSize: fontSize / 16,
    lineHeight,
    pageMargins: 0.5 + (paddingX / 100) * 1.5,
    scroll: false,
    textColor: t.fg,
    backgroundColor: t.bg,
    publisherStyles: false,
  }
  if (fontFamily === "serif") {
    prefs.fontFamily = "serif"
  } else if (fontFamily === "sans") {
    prefs.fontFamily = "sans-serif"
  }
  if (textAlign !== "auto") {
    prefs.textAlign = textAlign === "justify" ? "justify" : "start"
  }
  if (columnCount !== "auto") {
    prefs.columnCount = columnCount
  }
  return prefs
}
