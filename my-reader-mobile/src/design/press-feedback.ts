import chroma from "chroma-js"

import { mixInk } from "@/src/design/reader-chrome-palette"
import type { ThemePalette } from "@/src/design/tokens"

/**
 * Background color shown while a row/card is pressed on iOS.
 * Matches the treatment used by ListRow.
 */
export function pressedBackgroundColor(
  colorScheme: "light" | "dark",
  palette: ThemePalette,
): string {
  if (colorScheme === "light") {
    return mixInk(palette.text, palette.surface, 12)
  }

  return chroma(palette.surface).brighten(0.5).hex()
}

/**
 * Ripple color used for Android press feedback on rows/cards.
 * Matches the treatment used by ListRow.
 */
export function androidRippleColor(
  colorScheme: "light" | "dark",
  palette: ThemePalette,
): string {
  if (colorScheme === "light") {
    return chroma(palette.text).alpha(0.14).css()
  }

  return chroma(palette.text).alpha(0.2).css()
}
