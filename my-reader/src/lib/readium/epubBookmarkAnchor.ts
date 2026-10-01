import {
  hrefRoughlyMatches,
  type ReaderLocator,
} from "@my-reader/tools/reader-toc"
import type { EpubNavigator } from "@readium/navigator"
import type { Locator } from "@readium/shared"
import {
  captureReaderViewportAnchor,
  captureReaderViewportStartAnchor,
  isReaderTextLocatorVisible,
  isReaderViewportAnchorVisible,
  type ReaderViewportAnchorOffset,
  type ReaderViewportCapture,
  type ReaderViewportDomRange,
  type ReaderViewportLayoutState,
  readerViewportLayoutState,
  restoreReaderViewportAnchorOffset as restoreViewportAnchorOffset,
  sameReaderViewportLayout,
  readerViewportAnchorOffset as viewportAnchorOffset,
} from "./generatedReaderViewportAnchor"

export type { ReaderViewportAnchorOffset }

type BookmarkAnchor = Omit<ReaderViewportCapture, "yRatio">
const TEXT_CONTEXT_LENGTH = 32

function currentFrameWindow(navigator: EpubNavigator): Window | null {
  return navigator._cframes?.[0]?.iframe.contentWindow ?? null
}

function domRangeForLocator(
  locator: ReaderLocator,
): ReaderViewportDomRange | null {
  return locator.locations?.domRange ?? null
}

function withBlockTextContext(
  window: Window,
  anchor: ReaderViewportCapture,
): ReaderViewportCapture {
  const point = anchor.domRange.start
  const pointElement = window.document.querySelector(point.cssSelector)
  const block = window.document.querySelector(anchor.cssSelector)
  const textNode = pointElement
    ? Array.from(pointElement.childNodes).filter(
        (node): node is Text => node.nodeType === Node.TEXT_NODE,
      )[point.textNodeIndex]
    : undefined
  if (!block || !textNode || !block.contains(textNode)) return anchor

  const content = block.textContent ?? ""
  const prefix = window.document.createRange()
  prefix.selectNodeContents(block)
  prefix.setEnd(textNode, Math.min(point.charOffset ?? 0, textNode.data.length))
  const offset = prefix.toString().length
  const codePoint = content.codePointAt(offset)
  if (codePoint == null) return anchor

  const highlight = String.fromCodePoint(codePoint)
  const before = content.slice(
    Math.max(0, offset - TEXT_CONTEXT_LENGTH),
    offset,
  )
  const after = content.slice(
    offset + highlight.length,
    offset + highlight.length + TEXT_CONTEXT_LENGTH,
  )
  return {
    ...anchor,
    text: {
      ...(before ? { before } : {}),
      highlight,
      ...(after ? { after } : {}),
    },
  }
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

export function captureEpubViewportStartLocator(
  navigator: EpubNavigator,
  currentLocator: ReaderLocator,
): ReaderLocator | null {
  const window = currentFrameWindow(navigator)
  if (!window) return null
  const captured = captureReaderViewportStartAnchor(window)
  const anchor = captured ? withBlockTextContext(window, captured) : null
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

export function isEpubTextLocatorVisible(
  navigator: EpubNavigator,
  locator: Locator,
): boolean {
  if (!hrefRoughlyMatches(navigator.currentLocator.href, locator.href)) {
    return false
  }
  const window = currentFrameWindow(navigator)
  if (!window) return false
  const cssSelector = locator.locations.otherLocations?.get("cssSelector")
  return isReaderTextLocatorVisible(window, {
    locations: typeof cssSelector === "string" ? { cssSelector } : undefined,
    text: locator.text
      ? {
          before: locator.text.before,
          highlight: locator.text.highlight,
          after: locator.text.after,
        }
      : undefined,
  })
}
