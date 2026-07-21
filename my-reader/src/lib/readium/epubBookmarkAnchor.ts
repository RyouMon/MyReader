import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { EpubNavigator } from "@readium/navigator"

type BookmarkAnchor = {
  cssSelector: string
  domRange: {
    start: {
      cssSelector: string
      textNodeIndex: number
      charOffset: number
    }
  }
  text: {
    before?: string
    highlight: string
    after?: string
  }
}

type TextPoint = {
  node: Text
  offset: number
}

export type ReaderViewportAnchorOffset = {
  xRatio: number
  yRatio: number
}

type CaretPositionDocument = Document & {
  caretPositionFromPoint?: (
    x: number,
    y: number,
  ) => { offsetNode: Node; offset: number } | null
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => {
    return `\\${character.codePointAt(0)?.toString(16)} `
  })
}

function stableCssSelector(element: Element): string | null {
  const document = element.ownerDocument
  if (element.id) {
    const selector = `#${cssEscape(element.id)}`
    if (document.querySelectorAll(selector).length === 1) return selector
  }

  const parts: string[] = []
  let current: Element | null = element
  while (current) {
    let part = current.localName
    const currentName = current.localName
    const parent: Element | null = current.parentElement
    if (parent) {
      const siblings = [...parent.children].filter(
        (sibling) => sibling.localName === currentName,
      )
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`
      }
    }
    parts.unshift(part)
    if (current.id) {
      const idSelector = `#${cssEscape(current.id)}`
      if (document.querySelectorAll(idSelector).length === 1) {
        parts[0] = idSelector
        break
      }
    }
    current = parent
  }
  return parts.length > 0 ? parts.join(" > ") : null
}

function firstTextDescendant(node: Node | undefined): Text | null {
  if (!node) return null
  if (node.nodeType === Node.TEXT_NODE) return node as Text
  const walker = node.ownerDocument?.createTreeWalker(
    node,
    NodeFilter.SHOW_TEXT,
  )
  return (walker?.nextNode() as Text | null) ?? null
}

function textPointAt(window: Window, x: number, y: number): TextPoint | null {
  const document = window.document
  const caretPosition = (
    document as CaretPositionDocument
  ).caretPositionFromPoint?.(x, y)
  if (caretPosition) {
    const node =
      caretPosition.offsetNode.nodeType === Node.TEXT_NODE
        ? (caretPosition.offsetNode as Text)
        : (firstTextDescendant(
            caretPosition.offsetNode.childNodes[caretPosition.offset],
          ) ?? firstTextDescendant(caretPosition.offsetNode))
    if (node) return { node, offset: caretPosition.offset }
  }

  const caretRange = document.caretRangeFromPoint?.(x, y)
  if (!caretRange) return null
  const node =
    caretRange.startContainer.nodeType === Node.TEXT_NODE
      ? (caretRange.startContainer as Text)
      : (firstTextDescendant(
          caretRange.startContainer.childNodes[caretRange.startOffset],
        ) ?? firstTextDescendant(caretRange.startContainer))
  return node ? { node, offset: caretRange.startOffset } : null
}

function anchorCharacterOffset(text: string, requestedOffset: number): number {
  if (text.length === 0) return 0
  let offset = Math.min(Math.max(0, requestedOffset), text.length - 1)
  if (/\s/.test(text[offset] ?? "")) {
    for (let distance = 1; distance < text.length; distance += 1) {
      const after = offset + distance
      if (after < text.length && !/\s/.test(text[after] ?? "")) {
        offset = after
        break
      }
      const before = offset - distance
      if (before >= 0 && !/\s/.test(text[before] ?? "")) {
        offset = before
        break
      }
    }
  }
  const code = text.charCodeAt(offset)
  if (code >= 0xdc00 && code <= 0xdfff && offset > 0) return offset - 1
  return offset
}

function pointRect(document: Document, point: TextPoint): DOMRect | null {
  const text = point.node.data
  if (!text.trim()) return null
  const offset = anchorCharacterOffset(text, point.offset)
  const length = String.fromCodePoint(text.codePointAt(offset) ?? 0).length
  const range = document.createRange()
  range.setStart(point.node, offset)
  range.setEnd(point.node, Math.min(text.length, offset + length))
  return range.getClientRects()[0] ?? range.getBoundingClientRect()
}

export function captureReaderBookmarkAnchor(
  window: Window,
): BookmarkAnchor | null {
  const { document } = window
  const centerX = window.innerWidth / 2
  const centerY = window.innerHeight / 2
  const offsets = [0, -0.08, 0.08, -0.16, 0.16]
  let best: { point: TextPoint; distance: number } | null = null

  for (const yOffset of offsets) {
    for (const xOffset of offsets.slice(0, 3)) {
      const point = textPointAt(
        window,
        centerX + window.innerWidth * xOffset,
        centerY + window.innerHeight * yOffset,
      )
      if (!point?.node.data.trim()) continue
      const rect = pointRect(document, point)
      if (!rect) continue
      const distance = Math.hypot(
        rect.left + rect.width / 2 - centerX,
        rect.top + rect.height / 2 - centerY,
      )
      if (!best || distance < best.distance) best = { point, distance }
    }
  }

  if (!best) return null
  const parent = best.point.node.parentElement
  if (!parent) return null
  const cssSelector = stableCssSelector(parent)
  if (!cssSelector) return null
  const textNodes = [...parent.childNodes].filter(
    (node): node is Text => node.nodeType === Node.TEXT_NODE,
  )
  const textNodeIndex = textNodes.indexOf(best.point.node)
  if (textNodeIndex < 0) return null

  const content = best.point.node.data
  const charOffset = anchorCharacterOffset(content, best.point.offset)
  const highlight = String.fromCodePoint(content.codePointAt(charOffset) ?? 0)
  const before = content.slice(Math.max(0, charOffset - 32), charOffset)
  const after = content.slice(charOffset + highlight.length, charOffset + 33)

  return {
    cssSelector,
    domRange: {
      start: { cssSelector, textNodeIndex, charOffset },
    },
    text: {
      ...(before ? { before } : {}),
      highlight,
      ...(after ? { after } : {}),
    },
  }
}

export function isReaderBookmarkAnchorVisible(
  window: Window,
  locator: ReaderLocator,
): boolean {
  return [
    ...(rangeForReaderLocator(window, locator)?.getClientRects() ?? []),
  ].some(
    (rect) =>
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight,
  )
}

function currentFrameWindow(navigator: EpubNavigator): Window | null {
  return navigator._cframes[0]?.iframe.contentWindow ?? null
}

function rangeForReaderLocator(
  window: Window,
  locator: ReaderLocator,
): Range | null {
  const point = locator.locations?.domRange?.start
  if (!point) return null
  const element = window.document.querySelector(point.cssSelector)
  if (!element) return null
  const textNodes = [...element.childNodes].filter(
    (node): node is Text => node.nodeType === Node.TEXT_NODE,
  )
  const node = textNodes[point.textNodeIndex]
  if (!node || node.data.length === 0) return null
  const offset = anchorCharacterOffset(
    node.data,
    Math.min(point.charOffset ?? 0, node.data.length - 1),
  )
  const length = String.fromCodePoint(node.data.codePointAt(offset) ?? 0).length
  const range = window.document.createRange()
  range.setStart(node, offset)
  range.setEnd(node, Math.min(node.data.length, offset + length))
  return range
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
  if (!window) return null
  const rect = rangeForReaderLocator(window, locator)?.getClientRects()[0]
  if (!rect || window.innerWidth <= 0 || window.innerHeight <= 0) return null
  return {
    xRatio: (rect.left + rect.width / 2) / window.innerWidth,
    yRatio: (rect.top + rect.height / 2) / window.innerHeight,
  }
}

export function restoreReaderViewportAnchorOffset(
  navigator: EpubNavigator,
  locator: ReaderLocator,
  offset: ReaderViewportAnchorOffset,
): boolean {
  const window = currentFrameWindow(navigator)
  if (!window) return false
  const rect = rangeForReaderLocator(window, locator)?.getClientRects()[0]
  if (!rect) return false
  const targetY = offset.yRatio * window.innerHeight
  const currentY = rect.top + rect.height / 2
  window.scrollBy(0, currentY - targetY)
  return true
}

type ViewportLayoutMetrics = {
  clientHeight: number
  clientWidth: number
  scrollHeight: number
  scrollWidth: number
}

function viewportLayoutMetrics(window: Window): ViewportLayoutMetrics {
  const scrollingElement = window.document.scrollingElement
  return {
    clientHeight: scrollingElement?.clientHeight ?? window.innerHeight,
    clientWidth: scrollingElement?.clientWidth ?? window.innerWidth,
    scrollHeight: scrollingElement?.scrollHeight ?? 0,
    scrollWidth: scrollingElement?.scrollWidth ?? 0,
  }
}

function sameViewportLayout(
  first: ViewportLayoutMetrics | null,
  second: ViewportLayoutMetrics,
): boolean {
  return Boolean(
    first &&
      first.clientHeight === second.clientHeight &&
      first.clientWidth === second.clientWidth &&
      first.scrollHeight === second.scrollHeight &&
      first.scrollWidth === second.scrollWidth,
  )
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

  let previous: ViewportLayoutMetrics | null = null
  let stableFrames = 0
  for (let frame = 0; frame < 12; frame += 1) {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
    if (!isCurrent()) return false

    const next = viewportLayoutMetrics(window)
    stableFrames = sameViewportLayout(previous, next) ? stableFrames + 1 : 0
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
