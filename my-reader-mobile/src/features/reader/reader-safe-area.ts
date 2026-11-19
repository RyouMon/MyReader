import type { EdgeInsets } from "react-native-safe-area-context"

import {
  READER_BOTTOM_ACTION_SIZE,
  readerChromeEdgeInset,
  readerBottomActionInset,
} from "./components/reader/chrome/readerChromeConstants"

// ReadiumNavigator's default reflow content insets. They already include the
// platform safe area; the outer surface only needs to add the floating action
// row that Readium cannot know about.
const READIUM_COMPACT_CONTENT_INSET = 34
const READIUM_REGULAR_CONTENT_INSET = 62

/**
 * Status-bar visibility changes can temporarily report zero insets. Keep the
 * physical window insets reserved so the publication keeps the same viewport
 * while reader chrome is shown or hidden.
 */
export function reserveReaderInsets(
  insets: EdgeInsets,
  initialInsets: EdgeInsets | null | undefined,
): EdgeInsets {
  return {
    ...insets,
    top: Math.max(insets.top, initialInsets?.top ?? 0),
    bottom: Math.max(insets.bottom, initialInsets?.bottom ?? 0),
  }
}

/**
 * Android's navigator is configured not to apply its own system-bar padding,
 * so the React Native reader surface owns the top edge there. iOS Readium
 * applies its configured content inset, including the safe area, itself.
 */
export function readerContentTopInset(
  topInset: number,
  platform: string = "ios",
  isPad = false,
): number {
  if (platform !== "android") {
    const nativeInset = Math.max(
      topInset,
      isPad ? READIUM_REGULAR_CONTENT_INSET : READIUM_COMPACT_CONTENT_INSET,
    )
    return Math.max(
      0,
      readerChromeEdgeInset(topInset) + READER_BOTTOM_ACTION_SIZE - nativeInset,
    )
  }
  return readerChromeEdgeInset(topInset) + READER_BOTTOM_ACTION_SIZE
}

/**
 * Android's navigator does not add its own vertical inset, so the reader must
 * reserve the bottom action row. UIKit's navigator includes the safe area in
 * its configured content inset, so adding another React Native inset would
 * create visible space below the last line.
 */
export function readerContentBottomInset(
  bottomInset: number,
  platform: string = "ios",
  isPad = false,
): number {
  if (platform === "android") {
    return readerBottomActionInset(readerChromeEdgeInset(bottomInset))
  }
  const nativeInset = Math.max(
    bottomInset,
    isPad ? READIUM_REGULAR_CONTENT_INSET : READIUM_COMPACT_CONTENT_INSET,
  )
  return Math.max(
    0,
    readerChromeEdgeInset(bottomInset) +
      READER_BOTTOM_ACTION_SIZE -
      nativeInset,
  )
}
