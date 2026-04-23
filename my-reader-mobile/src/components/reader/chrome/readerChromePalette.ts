/**
 * Reader chrome palette — thin re-export from the canonical reader-tokens.
 * Kept for backward compatibility with existing imports.
 */
import {
  READER_CHROME,
  chromeBookmarkIconColor,
  chromeSegmentStyle,
  chromeThemeCardStyle,
  chromeTocRowStyle,
  chromeTocLabelStyle,
} from "@/src/design/reader-tokens";

export {
  READER_CHROME,
  chromeBookmarkIconColor,
  chromeSegmentStyle,
  chromeThemeCardStyle,
  chromeTocRowStyle,
  chromeTocLabelStyle,
};

/** @deprecated Use READER_CHROME.accent directly. */
export const READER_CHROME_ACCENT_HEX = READER_CHROME.accent;

/** @deprecated Use chromeSegmentStyle(active) from reader-tokens. */
export function chromeSegmentSurfaceStyle(active: boolean): {
  backgroundColor: string;
  borderColor: string;
} {
  return {
    backgroundColor: active
      ? READER_CHROME.surfaceActive
      : READER_CHROME.surfaceIdle,
    borderColor: active ? READER_CHROME.borderActive : READER_CHROME.border,
  };
}

/** @deprecated Use chromeThemeCardStyle(active) from reader-tokens. */
export function chromeThemeCardSurfaceStyle(active: boolean): {
  backgroundColor: string;
  borderColor: string;
} {
  return {
    backgroundColor: active
      ? "rgba(212,112,58,0.13)"
      : "rgba(255,255,255,0.05)",
    borderColor: active ? READER_CHROME.borderActive : READER_CHROME.border,
  };
}

/** @deprecated Use chromeTocRowStyle(active) from reader-tokens. */
export function chromeTocRowContainerStyle(active: boolean): {
  backgroundColor: string;
  borderWidth: number;
  borderColor: string;
} {
  return {
    backgroundColor: active
      ? READER_CHROME.surfaceActive
      : READER_CHROME.surfaceIdle,
    borderWidth: active ? 1 : 0,
    borderColor: active ? "rgba(212,112,58,0.30)" : "transparent",
  };
}

/** @deprecated Use chromeTocLabelStyle(active, accentColor) from reader-tokens. */
export function chromeTocRowLabelStyle(
  active: boolean,
  activeTextColor: string
): { color: string; fontWeight: "700" | "500" } {
  return {
    color: active ? activeTextColor : "rgba(255,255,255,0.80)",
    fontWeight: active ? "700" : "500",
  };
}

/** @deprecated Use chromeBookmarkIconColor(active) from reader-tokens. */
export function chromeTopBarBookmarkIconColor(bookmarkActive: boolean): string {
  return chromeBookmarkIconColor(bookmarkActive);
}
