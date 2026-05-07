import type { DomPageSlice, RangeBoundary } from "../../types"

/** 与分页器内部 {@link serializeLocationAsBoundary} 一致的位置描述。 */
export interface DomPaginationSourceLocation {
  node: Node
  offset: number
}

/** Creates the terminal range boundary at the end of the source content root. */
export function createRootEndBoundary(root: HTMLElement): RangeBoundary {
  return {
    path: [],
    offset: root.childNodes.length,
    isText: false,
  }
}

/** Serializes a source location into a DOM range boundary. */
export function serializeLocationAsBoundary(
  root: HTMLElement,
  location: DomPaginationSourceLocation,
): RangeBoundary {
  if (location.node === root) {
    return {
      path: [],
      offset: 0,
      isText: false,
    }
  }

  if (location.node.nodeType === Node.TEXT_NODE) {
    return {
      path: getNodePath(root, location.node),
      offset: Math.max(0, location.offset),
      isText: true,
    }
  }

  const parent = location.node.parentNode
  if (!parent) {
    return createRootEndBoundary(root)
  }

  return {
    path: getNodePath(root, parent),
    offset: getChildIndex(location.node),
    isText: false,
  }
}

/** Applies a serialized boundary to a live DOM range. */
export function applyRangeBoundary(
  range: Range,
  root: HTMLElement,
  boundary: RangeBoundary,
  isStart: boolean,
): void {
  const target = resolveNodePath(root, boundary.path)
  if (!target) {
    if (isStart) range.setStart(root, 0)
    else range.setEnd(root, root.childNodes.length)
    return
  }

  if (boundary.isText && target.nodeType === Node.TEXT_NODE) {
    const maxOffset = target.textContent?.length ?? 0
    const safeOffset = Math.max(0, Math.min(boundary.offset, maxOffset))
    if (isStart) range.setStart(target, safeOffset)
    else range.setEnd(target, safeOffset)
    return
  }

  const maxOffset = target.childNodes.length
  const safeOffset = Math.max(0, Math.min(boundary.offset, maxOffset))
  if (isStart) range.setStart(target, safeOffset)
  else range.setEnd(target, safeOffset)
}

/** Inverse of {@link serializeLocationAsBoundary}: resolve a stored boundary back to a live node+offset. */
export function sourceLocationFromBoundary(
  root: HTMLElement,
  boundary: RangeBoundary,
): DomPaginationSourceLocation | null {
  const target = resolveNodePath(root, boundary.path)
  if (!target) return null

  if (boundary.isText && target.nodeType === Node.TEXT_NODE) {
    const maxOffset = target.textContent?.length ?? 0
    return { node: target, offset: Math.max(0, Math.min(boundary.offset, maxOffset)) }
  }

  // Non-text: offset is a child index; if it points past the end, treat as root-end.
  if (target === root && boundary.offset >= target.childNodes.length) {
    return { node: root, offset: root.childNodes.length }
  }

  const child = target.childNodes.item(boundary.offset)
  if (child) {
    return { node: child, offset: 0 }
  }

  // Fallback: boundary.offset may be at end of a non-root element.
  return { node: target, offset: 0 }
}

function resolveNodePath(root: Node, path: number[]): Node | null {
  let current: Node | null = root
  for (const index of path) {
    current = current?.childNodes.item(index) ?? null
    if (!current) return null
  }
  return current
}

function getNodePath(root: Node, node: Node): number[] {
  const path: number[] = []
  let current: Node | null = node
  while (current && current !== root) {
    const currentParent: Node | null = current.parentNode
    if (!currentParent) break
    path.push(getChildIndex(current))
    current = currentParent
  }
  path.reverse()
  return path
}

function getChildIndex(node: Node): number {
  const parent = node.parentNode
  if (!parent) return 0
  return Array.prototype.indexOf.call(parent.childNodes, node) as number
}

/**
 * Range boundary at the start of an element, for jumping to in-book link targets after pagination.
 */
export function readingAnchorForElement(
  root: HTMLElement,
  el: HTMLElement,
): RangeBoundary {
  return serializeLocationAsBoundary(root, { node: el, offset: 0 })
}

/** 将 {@link RangeBoundary} 应用到 Range 的起点（与分页器内部逻辑一致）。 */
export function fillRangeStartFromBoundary(
  range: Range,
  root: HTMLElement,
  boundary: RangeBoundary,
): void {
  applyRangeBoundary(range, root, boundary, true)
}

/**
 * 将任意 Range 的起点化为相对 `root` 的边界（用于 CFI 解析结果与分页 sourceRoot 对齐）。
 */
export function readingAnchorForRangeStart(
  root: HTMLElement,
  r: Range,
): RangeBoundary {
  const sc = r.startContainer
  const so = r.startOffset
  if (sc.nodeType === Node.TEXT_NODE) {
    return serializeLocationAsBoundary(root, { node: sc, offset: so })
  }
  if (sc.nodeType === Node.ELEMENT_NODE) {
    if (sc === root) {
      return { path: [], offset: so, isText: false }
    }
    if (root.contains(sc)) {
      return {
        path: getNodePath(root, sc),
        offset: so,
        isText: false,
      }
    }
  }
  return { path: [], offset: 0, isText: false }
}

function compareBoundariesInDocumentOrder(
  root: HTMLElement,
  a: RangeBoundary,
  b: RangeBoundary,
): number {
  const doc = root.ownerDocument
  const ra = doc.createRange()
  const rb = doc.createRange()
  try {
    applyRangeBoundary(ra, root, a, true)
    ra.collapse(true)
    applyRangeBoundary(rb, root, b, true)
    rb.collapse(true)
    return ra.compareBoundaryPoints(Range.START_TO_START, rb)
  } catch {
    return 0
  }
}

function findPageIndexByStartOrderFallback(
  sourceRoot: HTMLElement,
  pages: DomPageSlice[],
  anchor: RangeBoundary,
): number {
  let best = 0
  for (let i = 0; i < pages.length; i++) {
    try {
      if (
        compareBoundariesInDocumentOrder(sourceRoot, pages[i].start, anchor) <=
        0
      ) {
        best = i
      }
    } catch {
      // skip malformed slice
    }
  }
  return best
}

export function findPageIndexForReadingAnchor(
  sourceRoot: HTMLElement,
  pages: DomPageSlice[],
  anchor: RangeBoundary,
): number {
  if (pages.length === 0) return 0
  const doc = sourceRoot.ownerDocument
  const point = doc.createRange()
  try {
    applyRangeBoundary(point, sourceRoot, anchor, true)
    point.collapse(true)
  } catch {
    return findPageIndexByStartOrderFallback(sourceRoot, pages, anchor)
  }

  for (let i = 0; i < pages.length; i++) {
    const slice = pages[i]
    const pageRange = doc.createRange()
    try {
      applyRangeBoundary(pageRange, sourceRoot, slice.start, true)
      applyRangeBoundary(pageRange, sourceRoot, slice.end, false)
    } catch {
      continue
    }
    try {
      const afterOrAtStart =
        pageRange.compareBoundaryPoints(Range.START_TO_START, point) <= 0
      const beforeEnd =
        point.compareBoundaryPoints(Range.START_TO_END, pageRange) < 0
      if (afterOrAtStart && beforeEnd) return i
    } catch {
      // skip malformed slice
    }
  }

  return findPageIndexByStartOrderFallback(sourceRoot, pages, anchor)
}
