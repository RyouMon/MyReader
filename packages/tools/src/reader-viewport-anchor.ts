/**
 * Shared reader viewport-anchor source.
 * After editing, run from the repository root:
 * pnpm -C my-reader-mobile prepare:reader-viewport-anchor
 *
 * This is the only hand-written DOM implementation. The generator emits the
 * desktop TypeScript and the Swift/Kotlin scripts executed in EPUB web views.
 * Do not edit those generated files directly.
 */

/** A text position that can be resolved again inside an EPUB document. */
export type ReaderViewportDomRange = {
  start: {
    cssSelector: string
    textNodeIndex: number
    charOffset?: number
  }
}

export type ReaderViewportCapture = {
  cssSelector: string
  domRange: ReaderViewportDomRange
  text: {
    before?: string
    highlight: string
    after?: string
  }
  yRatio: number
}

/** The anchor's normalized position in the current viewport. */
export type ReaderViewportAnchorOffset = {
  xRatio: number
  yRatio: number
}

export type ReaderViewportLayoutState = {
  fontsLoaded: boolean
  clientHeight: number
  clientWidth: number
  scrollHeight: number
  scrollWidth: number
}

type TextPoint = {
  node: Text
  offset: number
}

type CaretPositionDocument = Document & {
  caretPositionFromPoint?: (
    x: number,
    y: number,
  ) => { offsetNode: Node; offset: number } | null
}

type CssWindow = Window & {
  CSS?: {
    escape?: (value: string) => string
  }
}

function cssEscape(window: Window, value: string): string {
  const css = (window as CssWindow).CSS
  if (typeof css?.escape === "function") {
    return css.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => {
    return `\\${character.codePointAt(0)?.toString(16)} `
  })
}

/** Prefers a unique ID, then falls back to a deterministic element path. */
function stableCssSelector(window: Window, element: Element): string | null {
  const document = element.ownerDocument
  if (element.id) {
    const selector = `#${cssEscape(window, element.id)}`
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
      const idSelector = `#${cssEscape(window, current.id)}`
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

/**
 * Keeps anchors on visible text and prevents splitting a UTF-16 surrogate pair.
 */
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

/** Resolves a persisted DOM point to the single character used as its anchor. */
function rangeForReaderViewportDomRange(
  window: Window,
  domRange: ReaderViewportDomRange,
): Range | null {
  const point = domRange.start
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

/**
 * Samples around the viewport center and captures the closest rendered glyph.
 * Nearby samples handle centers that land in whitespace or between columns.
 */
export function captureReaderViewportAnchor(
  window: Window,
): ReaderViewportCapture | null {
  const { document } = window
  const centerX = window.innerWidth / 2
  const centerY = window.innerHeight / 2
  const offsets = [0, -0.08, 0.08, -0.16, 0.16]
  let best: { point: TextPoint; rect: DOMRect; distance: number } | null = null

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
      if (!best || distance < best.distance) best = { point, rect, distance }
    }
  }

  if (!best) return null
  const parent = best.point.node.parentElement
  if (!parent) return null
  const cssSelector = stableCssSelector(window, parent)
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
    yRatio: (best.rect.top + best.rect.height / 2) / window.innerHeight,
  }
}

/** Returns whether the persisted anchor character intersects the viewport. */
export function isReaderViewportAnchorVisible(
  window: Window,
  domRange: ReaderViewportDomRange,
): boolean {
  return [
    ...(rangeForReaderViewportDomRange(window, domRange)?.getClientRects() ??
      []),
  ].some(
    (rect) =>
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight,
  )
}

/** Captures the anchor's normalized position before a reflow. */
export function readerViewportAnchorOffset(
  window: Window,
  domRange: ReaderViewportDomRange,
): ReaderViewportAnchorOffset | null {
  const rect = rangeForReaderViewportDomRange(
    window,
    domRange,
  )?.getClientRects()[0]
  if (!rect || window.innerWidth <= 0 || window.innerHeight <= 0) return null
  return {
    xRatio: (rect.left + rect.width / 2) / window.innerWidth,
    yRatio: (rect.top + rect.height / 2) / window.innerHeight,
  }
}

/** Restores the anchor's vertical viewport position after a reflow. */
export function restoreReaderViewportAnchorOffset(
  window: Window,
  domRange: ReaderViewportDomRange,
  yRatio: number,
): boolean {
  const rect = rangeForReaderViewportDomRange(
    window,
    domRange,
  )?.getClientRects()[0]
  if (!rect) return false
  const targetY = yRatio * window.innerHeight
  const currentY = rect.top + rect.height / 2
  window.scrollBy(0, currentY - targetY)
  return true
}

/** Captures the metrics used by platform adapters to detect settled layout. */
export function readerViewportLayoutState(
  window: Window,
): ReaderViewportLayoutState {
  const scrollingElement = window.document.scrollingElement
  return {
    fontsLoaded:
      !window.document.fonts || window.document.fonts.status === "loaded",
    clientHeight: scrollingElement?.clientHeight ?? window.innerHeight,
    clientWidth: scrollingElement?.clientWidth ?? window.innerWidth,
    scrollHeight: scrollingElement?.scrollHeight ?? 0,
    scrollWidth: scrollingElement?.scrollWidth ?? 0,
  }
}

/** Compares only dimensions that change when EPUB pagination or reflow moves. */
export function sameReaderViewportLayout(
  first: ReaderViewportLayoutState | null,
  second: ReaderViewportLayoutState,
): boolean {
  return Boolean(
    first &&
      first.clientHeight === second.clientHeight &&
      first.clientWidth === second.clientWidth &&
      first.scrollHeight === second.scrollHeight &&
      first.scrollWidth === second.scrollWidth,
  )
}

/**
 * Binds the shared helpers to the EPUB web view's window for native bridges.
 * Swift and Kotlin call these methods without passing the window explicitly.
 */
export function createReaderViewportAnchorRuntime(window: Window) {
  return {
    captureReaderViewportAnchor: () => captureReaderViewportAnchor(window),
    isReaderViewportAnchorVisible: (domRange: ReaderViewportDomRange) =>
      isReaderViewportAnchorVisible(window, domRange),
    readerViewportLayoutState: () => readerViewportLayoutState(window),
    restoreReaderViewportAnchorOffset: (
      domRange: ReaderViewportDomRange,
      yRatio: number,
    ) => restoreReaderViewportAnchorOffset(window, domRange, yRatio),
  }
}
