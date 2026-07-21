import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { EpubNavigator } from "@readium/navigator"
import {
  captureReaderViewportAnchor,
  type ReaderViewportAnchorOffset,
  type ReaderViewportCapture,
  type ReaderViewportDomRange,
  type ReaderViewportLayoutState,
  isReaderViewportAnchorVisible,
  readerViewportAnchorOffset as viewportAnchorOffset,
  readerViewportLayoutState,
  restoreReaderViewportAnchorOffset as restoreViewportAnchorOffset,
  sameReaderViewportLayout,
} from "./generatedReaderViewportAnchor"

export type { ReaderViewportAnchorOffset }

type BookmarkAnchor = Omit<ReaderViewportCapture, "yRatio">

function currentFrameWindow(navigator: EpubNavigator): Window | null {
  return navigator._cframes[0]?.iframe.contentWindow ?? null
}

function domRangeForLocator(
  locator: ReaderLocator,
): ReaderViewportDomRange | null {
  return locator.locations?.domRange ?? null
}

export function captureReaderBookmarkAnchor(
  window: Window,
): BookmarkAnchor | null {
  const capture = captureReaderViewportAnchor(window)
  if (!capture) return null
  const { yRatio: _yRatio, ...anchor } = capture
  return anchor
}

export function isReaderBookmarkAnchorVisible(
  window: Window,
  locator: ReaderLocator,
): boolean {
  const domRange = domRangeForLocator(locator)
  return domRange ? isReaderViewportAnchorVisible(window, domRange) : false
}

export function captureEpubBookmarkLocator(
  navigator: EpubNavigator,
  currentLocator: ReaderLocator,
): ReaderLocator | null {
  const window = currentFrameWindow(navigator)
  if (!window) return null
  const anchor = captureReaderBookmarkAnchor(window)
  if (!anchor) return null
  return {
    ...currentLocator,
    locations: {
      ...currentLocator.locations,
      progression: currentLocator.locations?.progression ?? 0,
      cssSelector: anchor.cssSelector,
      domRange: anchor.domRange,
    },
    text: anchor.text,
  }
}

export function readerViewportAnchorOffset(
  navigator: EpubNavigator,
  locator: ReaderLocator,
): ReaderViewportAnchorOffset | null {
  const window = currentFrameWindow(navigator)
  const domRange = domRangeForLocator(locator)
  return window && domRange ? viewportAnchorOffset(window, domRange) : null
}

export function restoreReaderViewportAnchorOffset(
  navigator: EpubNavigator,
  locator: ReaderLocator,
  offset: ReaderViewportAnchorOffset,
): boolean {
  const window = currentFrameWindow(navigator)
  const domRange = domRangeForLocator(locator)
  return window && domRange
    ? restoreViewportAnchorOffset(window, domRange, offset.yRatio)
    : false
}

export async function waitForEpubViewportLayout(
  navigator: EpubNavigator,
  isCurrent: () => boolean,
): Promise<boolean> {
  const window = currentFrameWindow(navigator)
  if (!window) return false

  try {
    await window.document.fonts?.ready
  } catch {
    // Layout metrics below remain the source of truth when FontFaceSet fails.
  }

  let previous: ReaderViewportLayoutState | null = null
  let stableFrames = 0
  for (let frame = 0; frame < 12; frame += 1) {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
    if (!isCurrent()) return false

    const next = readerViewportLayoutState(window)
    stableFrames =
      next.fontsLoaded && sameReaderViewportLayout(previous, next)
        ? stableFrames + 1
        : 0
    if (stableFrames >= 2) return true
    previous = next
  }
  return isCurrent()
}

export function isEpubBookmarkVisible(
  navigator: EpubNavigator,
  locator: ReaderLocator,
): boolean {
  const window = currentFrameWindow(navigator)
  return window ? isReaderBookmarkAnchorVisible(window, locator) : false
}
