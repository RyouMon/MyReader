export {
  mixReaderChromeColor as mixInk,
  type ReaderChromePalette,
  readerChromePalette,
  readerChromeUnderlay as underlayFromSurface,
} from "@my-reader/tools/reader-chrome-palette"
import type { ReaderChromePalette } from "@my-reader/tools/reader-chrome-palette"
import type { ThemePalette } from "./tokens"

export function readerFormColors(
  palette: ReaderChromePalette,
): Partial<ThemePalette> {
  return {
    text: palette.text,
    textMuted: palette.textMuted,
    surface: palette.segmentIdle,
    background: palette.bg,
    primary: palette.accent,
    primaryForeground: palette.bg,
    secondary: palette.segmentActive,
    border: palette.border,
    borderStrong: palette.sliderTrack,
  }
}
