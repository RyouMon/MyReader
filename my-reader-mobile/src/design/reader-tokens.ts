import {
  READER_THEME_PRESETS,
  type ReaderThemeKey,
} from "@my-reader/tools/reader-themes"

/**
 * Reader-chrome semantic tokens for the mobile reading experience.
 * Mirrors the CSS variable system in my-reader/src/reader.css.
 *
 * Structure:
 *   - readerThemes: content area colors per reading theme
 *   - readerChrome: chrome UI colors (always dark regardless of app theme)
 *   - readerFixed: fixed-layout viewer (CBZ/PDF/fixed EPUB) — always dark
 */

/** Reading content background/foreground per theme. */
export type ReaderThemeColors = {
  bg: string
  fg: string
}

export const READER_THEMES = Object.fromEntries(
  READER_THEME_PRESETS.map((theme) => [
    theme.key,
    { bg: theme.backgroundColor, fg: theme.foregroundColor },
  ]),
) as Record<ReaderThemeKey, ReaderThemeColors>

export type ReaderThemeName = ReaderThemeKey

const READER_CHROME_BORDER = {
  subtle: "rgba(255,255,255,0.05)",
  active: "rgba(245, 239, 230, 0.22)",
  error: "rgba(255,255,255,0.08)",
} as const

/** Chrome UI tokens — used for controls/chrome overlay. Always dark. */
export const READER_CHROME = {
  /** Primary accent (bookmark, slider active, segment active). */
  accent: "#d4803a",

  /** Canvas/surface for chrome overlays. */
  surface: "#110D0A",
  /** Semi-transparent panel surface. */
  surfaceAlpha: "rgba(17,13,10,0.82)",

  /** Idle icon/text color. */
  textIdle: "#F4EEE6",
  /** Muted icon/text. */
  textMuted: "rgba(244,238,230,0.56)",
  /** Strong / primary text. */
  textStrong: "rgba(244,238,230,0.96)",
  /** Secondary text. */
  textSecondary: "rgba(244,238,230,0.78)",

  /** Default border / divider. */
  border: READER_CHROME_BORDER.subtle,
  /** Border for active/selected items. */
  borderActive: READER_CHROME_BORDER.active,

  /** Surface for inactive segments/cards. */
  surfaceIdle: "rgba(255,255,255,0.06)",
  /** Surface for active/selected items (accent tint). */
  surfaceActive: "rgba(196, 96, 42, 0.12)",

  /** Loading indicator color. */
  loadingIndicator: "rgba(255,255,255,0.70)",

  /** Scrim over reading content (e.g. chapter load mask). */
  scrim: "rgba(0,0,0,0.45)",
  /** Error card background. */
  errorCardBg: "rgba(255,255,255,0.08)",
  /** Error card border. */
  errorCardBorder: READER_CHROME_BORDER.error,
} as const

/** Fixed-layout viewer background (CBZ, PDF, fixed EPUB). Always dark/neutral. */
export const READER_FIXED = {
  /** Page canvas background — near-black neutral. */
  canvasBg: "#111111",
  /** Theme-mapped backgrounds (for PDF/fixed with light content). */
  themeBg: Object.fromEntries(
    READER_THEME_PRESETS.map((theme) => [theme.key, theme.backgroundColor]),
  ) as Record<ReaderThemeKey, string>,
} as const

/**
 * Returns the chrome icon color for the bookmark button.
 * Active = accent, idle = cream text.
 */
export function chromeBookmarkIconColor(active: boolean): string {
  return active ? READER_CHROME.accent : READER_CHROME.textIdle
}

/**
 * Segment control surface style (reading mode selector, page direction selector).
 */
export function chromeSegmentStyle(active: boolean): {
  backgroundColor: string
  borderColor: string
} {
  return {
    backgroundColor: active
      ? READER_CHROME.surfaceActive
      : READER_CHROME.surfaceIdle,
    borderColor: active ? READER_CHROME.borderActive : READER_CHROME.border,
  }
}

/**
 * Theme card selection style (reading theme swatch).
 */
export function chromeThemeCardStyle(active: boolean): {
  backgroundColor: string
  borderColor: string
} {
  return {
    backgroundColor: active
      ? READER_CHROME.surfaceActive
      : READER_CHROME.surfaceIdle,
    borderColor: active ? READER_CHROME.borderActive : READER_CHROME.border,
  }
}

/**
 * TOC row container style.
 */
export function chromeTocRowStyle(active: boolean): {
  backgroundColor: string
  borderWidth: number
  borderColor: string
} {
  return {
    backgroundColor: active
      ? READER_CHROME.surfaceActive
      : READER_CHROME.surfaceIdle,
    borderWidth: active ? 1 : 0,
    borderColor: active ? READER_CHROME.borderActive : "transparent",
  }
}

/**
 * TOC row label text style.
 */
export function chromeTocLabelStyle(active: boolean): {
  color: string
  fontWeight: "700" | "500"
} {
  return {
    color: active ? READER_CHROME.accent : READER_CHROME.textSecondary,
    fontWeight: active ? "700" : "500",
  }
}
