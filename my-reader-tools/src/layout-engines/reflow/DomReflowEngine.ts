import type {
  DomPageSlice,
  IPaginator,
  LayoutConfig,
  PageData,
  ReaderTypographyConfig,
  TextChapterData,
  TextChapterPaginationResult,
} from "../../rendition/types"
import { scopeEpubCss } from "../../rendition/utils"
import {
  createRootEndBoundary,
  serializeLocationAsBoundary,
  type DomPaginationSourceLocation,
} from "./DomBoundaryMapper"
import {
  appendScopedStyles,
  READER_TYPOGRAPHY_OVERRIDE_CSS,
} from "./DomSliceRenderer"
import type { DomReflowLayoutOptions, ReflowLayoutEngine } from "./types"

type ProgressiveTextPaginator = IPaginator<
  { chapter: TextChapterData; pages: DomPageSlice[] },
  PageData
>

/** 双栏测量半宽与阅读器双栏 flex gap 共用（px）。 */
export const PAGINATION_DOUBLE_COLUMN_GAP_PX = 28

type SourceLocation = DomPaginationSourceLocation

function paginationColumnMeasureWidthPx(
  viewportWidth: number,
  doubleColumn: boolean,
): number {
  if (!doubleColumn || viewportWidth <= 0) return viewportWidth
  return Math.max(
    96,
    Math.floor((viewportWidth - PAGINATION_DOUBLE_COLUMN_GAP_PX) / 2),
  )
}

const READER_SOURCE_ROOT_CLASS =
  "reader-chapter-container reader-paginated-container reader-body-content"

const READER_MEASURE_ROOT_CLASS =
  "reader-chapter-container reader-paginated-container reader-body-content"

const BREAK_AVOID_VALUES = new Set(["avoid", "avoid-page", "avoid-column"])
const BREAK_FORCE_VALUES = new Set([
  "page",
  "always",
  "left",
  "right",
  "column",
])

interface AppendedNodeState {
  node?: Node
  target?: Node
  depth: number
}

interface ClonedAncestorTree {
  tree: Node | null
  innerMost: Node | null
}

async function ensureImageDrawable(img: HTMLImageElement): Promise<void> {
  if (!img.src && !img.srcset?.trim()) return
  if (img.complete && img.naturalWidth > 0) return
  try {
    if (typeof img.decode === "function") await img.decode()
  } catch {
    // broken or unsupported
  }
  if (img.complete && img.naturalWidth > 0) return
  await new Promise<void>((resolve) => {
    img.addEventListener("load", () => resolve(), { once: true })
    img.addEventListener("error", () => resolve(), { once: true })
  })
}

async function preloadImagesForPagination(root: HTMLElement): Promise<void> {
  const imgs = root.querySelectorAll("img")
  if (imgs.length === 0) return
  await Promise.all(Array.from(imgs).map((img) => ensureImageDrawable(img)))
}

function syncLaidOutColumnHeight(
  measureRoot: HTMLElement,
  measureContainer: HTMLElement,
): number {
  return Math.round(
    measureRoot.getBoundingClientRect().bottom -
      measureContainer.getBoundingClientRect().top,
  )
}

/** Measures a chapter in a hidden host and stores slices into the paginator. */
export async function layoutTextChapterAtMeasureHost(
  chapter: TextChapterData,
  config: LayoutConfig,
  measureHost: HTMLDivElement,
  paginator: ProgressiveTextPaginator,
): Promise<TextChapterPaginationResult> {
  const width = paginationColumnMeasureWidthPx(
    config.viewPortWidth,
    Boolean(config.doubleColumn),
  )
  const height = config.viewPortHeight
  const typography: ReaderTypographyConfig = {
    fontFamily: config.fontFamily,
    fontSize: config.fontSize,
    lineHeight: config.lineHeight,
    paddingX: config.paddingX,
  }

  if (width <= 0 || height <= 0) {
    return {
      mode: "full",
      pages: [],
      pageCount: 1,
      sourceRoot: null,
      texts: [],
    }
  }

  measureHost.replaceChildren()
  const { container: sourceContainer, content: sourceRoot } =
    buildChapterDom(chapter)
  applyTypography(sourceContainer, typography)

  const { container: measureContainer, content: measureRoot } =
    buildEmptyMeasureDom(chapter)
  applyTypography(measureContainer, typography)
  measureContainer.style.width = `${width}px`
  measureContainer.style.height = `${height}px`
  measureContainer.style.overflow = "hidden"

  measureHost.style.width = `${width}px`
  measureHost.style.position = "absolute"
  measureHost.style.left = "-9999px"
  measureHost.style.top = "0"
  measureHost.style.opacity = "0"
  measureHost.style.pointerEvents = "none"

  measureHost.appendChild(sourceContainer)
  measureHost.appendChild(measureContainer)

  await preloadImagesForPagination(sourceContainer)

  const pages = await paginateDomIntoPages(
    sourceRoot,
    measureContainer,
    measureRoot,
  )
  await paginator.layout({ chapter, pages }, config)

  measureHost.replaceChildren()
  return {
    mode: pages.length > 0 ? "sliced" : "full",
    pages,
    pageCount: Math.max(1, pages.length),
    sourceRoot,
    texts: [],
  }
}

function buildChapterDom(chapter: TextChapterData): {
  container: HTMLDivElement
  content: HTMLDivElement
} {
  const container = document.createElement("div")
  container.className = READER_SOURCE_ROOT_CLASS

  const raw = chapter.cssText ?? ""
  const scopedCss = raw ? scopeEpubCss(raw) : ""
  const epubStyle = scopedCss ? `<style>${scopedCss}</style>` : ""
  const readerStyle = `<style data-reader-typography>${READER_TYPOGRAPHY_OVERRIDE_CSS}</style>`
  container.innerHTML = `${epubStyle}${readerStyle}<div class="reader-epub-scope">${chapter.bodyHtml}</div>`

  const content = container.querySelector(".reader-epub-scope")
  if (!(content instanceof HTMLDivElement)) {
    throw new Error("Chapter DOM root was not created")
  }

  return { container, content }
}

function buildEmptyMeasureDom(chapter: TextChapterData): {
  container: HTMLDivElement
  content: HTMLDivElement
} {
  const container = document.createElement("div")
  container.className = READER_MEASURE_ROOT_CLASS
  appendScopedStyles(container, chapter.cssText ?? "")

  const content = document.createElement("div")
  content.className = "reader-epub-scope"
  container.appendChild(content)

  return { container, content }
}

async function paginateDomIntoPages(
  sourceRoot: HTMLElement,
  measureContainer: HTMLElement,
  measureRoot: HTMLElement,
): Promise<DomPageSlice[]> {
  if (sourceRoot.childNodes.length <= 0) return []

  const pages: DomPageSlice[] = []
  let current = createRootStartLocation(sourceRoot)
  const maxIterations = Math.max(1, countNodes(sourceRoot) * 2)

  for (let i = 0; i < maxIterations; i += 1) {
    const next = await paginateOnePage(
      sourceRoot,
      measureContainer,
      measureRoot,
      current,
    )

    if (!next) {
      pages.push({
        start: serializeLocationAsBoundary(sourceRoot, current),
        end: createRootEndBoundary(sourceRoot),
      })
      return pages
    }

    let safeNext = next
    if (isSameLocation(current, safeNext)) {
      const advanced = advanceSourceLocation(sourceRoot, current)
      if (!advanced || isSameLocation(current, advanced)) {
        pages.push({
          start: serializeLocationAsBoundary(sourceRoot, current),
          end: createRootEndBoundary(sourceRoot),
        })
        return pages
      }
      safeNext = advanced
    }

    pages.push({
      start: serializeLocationAsBoundary(sourceRoot, current),
      end: serializeLocationAsBoundary(sourceRoot, safeNext),
    })
    current = safeNext
  }

  pages.push({
    start: serializeLocationAsBoundary(sourceRoot, current),
    end: createRootEndBoundary(sourceRoot),
  })
  return pages
}

async function paginateOnePage(
  sourceRoot: HTMLElement,
  measureContainer: HTMLElement,
  measureRoot: HTMLElement,
  start: SourceLocation,
): Promise<SourceLocation | null> {
  measureRoot.replaceChildren()

  let node = start.node
  let offset = start.offset
  let target: Node = measureRoot
  let depth = 0
  let breakAtDepth = 0
  let avoidInside: {
    node: Node
    target: Node
  } | null = null
  let nodesAdded = 0
  let heightAdded = 0

  if (node !== sourceRoot) {
    const cloned = cloneAncestorsUntil(node, sourceRoot)
    if (cloned.tree && cloned.innerMost) {
      measureRoot.appendChild(cloned.tree)
      target = cloned.innerMost
    }

    if (offset > 0 && node.nodeType === Node.TEXT_NODE) {
      const partial = document.createTextNode(
        node.textContent?.slice(offset) ?? "",
      )
      target.appendChild(partial)
      if (didOverflow(partial, measureContainer, measureRoot)) {
        const newOffset = findOverflowOffset(
          partial,
          measureContainer,
          measureRoot,
        )
        target.removeChild(partial)
        if (newOffset > 0) {
          target.appendChild(
            document.createTextNode(
              partial.textContent?.slice(0, newOffset) ?? "",
            ),
          )
        }
        return {
          node,
          offset: offset + Math.max(1, newOffset),
        }
      }
      target = partial
      offset = 0
    } else {
      const clonedNode = node.cloneNode(false)
      target.appendChild(clonedNode)
      target = clonedNode
    }
  }

  heightAdded = syncLaidOutColumnHeight(measureRoot, measureContainer)

  let firstRun = true

  while (true) {
    if (!firstRun || node === sourceRoot) {
      const appended = appendNextNodeForward(node, target, depth, sourceRoot)
      if (!appended.node || !appended.target) {
        return null
      }
      node = appended.node
      target = appended.target
      depth = appended.depth
    }
    firstRun = false

    const breakRule = shouldBreak(target)
    if (!avoidInside && breakRule === "avoid-inside") {
      avoidInside = { node, target }
      breakAtDepth = depth
    } else if (
      depth <= breakAtDepth &&
      avoidInside &&
      node !== avoidInside.node
    ) {
      breakAtDepth = 0
      avoidInside = null
    }

    const breakBefore = breakRule === "before" && nodesAdded > 0

    if (target instanceof HTMLImageElement) {
      await ensureImageDrawable(target)
    }

    let overflowed = didOverflow(target, measureContainer, measureRoot)

    if (
      overflowed &&
      heightAdded <= 1 &&
      target.nodeType !== Node.TEXT_NODE &&
      target instanceof HTMLElement
    ) {
      const r = measureContainer.getBoundingClientRect()
      target.style.boxSizing = "border-box"
      target.style.width = "auto"
      target.style.maxWidth = `${Math.floor(r.width)}px`
      target.style.maxHeight = `${Math.floor(r.height)}px`
      target.style.objectFit = "contain"
      void target.getBoundingClientRect()
      overflowed = didOverflow(target, measureContainer, measureRoot)
    }

    if (overflowed || breakBefore) {
      if (breakAtDepth && depth >= breakAtDepth && avoidInside) {
        avoidInside.target.parentNode?.removeChild(avoidInside.target)
        return {
          node: avoidInside.node,
          offset: 0,
        }
      }

      if (target.nodeType === Node.TEXT_NODE && !breakBefore) {
        const splitOffset = findOverflowOffset(
          target as Text,
          measureContainer,
          measureRoot,
        )
        const parent = target.parentNode
        parent?.removeChild(target)
        if (splitOffset > 0 && parent) {
          parent.appendChild(
            document.createTextNode(
              node.textContent?.slice(0, splitOffset) ?? "",
            ),
          )
        }
        return {
          node,
          offset: Math.max(0, splitOffset),
        }
      }

      target.parentNode?.removeChild(target)
      return {
        node,
        offset: 0,
      }
    }

    if (
      target.nodeType !== Node.TEXT_NODE ||
      (target.textContent?.trim() ?? "") !== ""
    ) {
      nodesAdded += 1
    }
    heightAdded = syncLaidOutColumnHeight(measureRoot, measureContainer)
  }
}

function appendNextNodeForward(
  node: Node,
  target: Node,
  depth: number,
  root: HTMLElement,
): AppendedNodeState {
  let nextNode: Node | null = node
  let nextTarget: Node | null = target
  let nextDepth = depth

  if (nextNode.childNodes.length > 0) {
    nextNode = nextNode.firstChild
    nextDepth += 1
    const cloned = nextNode?.cloneNode(false) ?? null
    if (!cloned) return { depth: nextDepth }
    nextTarget.appendChild(cloned)
    nextTarget = cloned
  } else if (nextNode.nextSibling) {
    nextNode = nextNode.nextSibling
    const cloned = nextNode.cloneNode(false)
    nextTarget.parentNode?.appendChild(cloned)
    nextTarget = cloned
  } else {
    while (nextNode) {
      nextNode = nextNode.parentNode
      if (!nextNode || nextNode === root) {
        return { depth: nextDepth }
      }

      if (!nextTarget?.parentNode) {
        return { depth: nextDepth }
      }
      nextTarget = nextTarget.parentNode
      nextDepth -= 1

      if (nextNode.nextSibling) {
        nextNode = nextNode.nextSibling
        const cloned = nextNode.cloneNode(false)
        nextTarget?.parentNode?.appendChild(cloned)
        nextTarget = cloned
        break
      }
    }
  }

  return {
    node: nextNode ?? undefined,
    target: nextTarget ?? undefined,
    depth: nextDepth,
  }
}

function cloneAncestorsUntil(
  node: Node,
  root: HTMLElement,
): ClonedAncestorTree {
  let tree: Node | null = null
  let innerMost: Node | null = null
  let current: Node | null = node

  while (current?.parentNode && current.parentNode !== root) {
    const clonedParent = current.parentNode.cloneNode(false)
    if (!innerMost) innerMost = clonedParent
    if (tree) clonedParent.appendChild(tree)
    tree = clonedParent
    current = current.parentNode
  }

  return { tree, innerMost }
}

function didOverflow(
  target: Node,
  measureContainer: HTMLElement,
  stopRoot: HTMLElement,
): boolean {
  const rect =
    target instanceof Element
      ? target.getBoundingClientRect()
      : getTextRect(target as Text)

  const anchor =
    target instanceof HTMLElement
      ? target
      : getFirstElementAncestor(target, stopRoot)
  const spacing = anchor
    ? getAncestorsCombinedBottomSpacing(anchor, stopRoot)
    : 0
  const pageBottom = Math.floor(measureContainer.getBoundingClientRect().bottom)
  const edge = Math.round(rect.bottom + spacing)

  return edge > pageBottom
}

function findOverflowOffset(
  target: Text,
  measureContainer: HTMLElement,
  stopRoot: HTMLElement,
): number {
  const text = target.textContent ?? ""
  const len = text.length
  if (len <= 0) return 0
  if (len === 1) return 1

  const range = target.ownerDocument.createRange()
  range.selectNode(target)
  range.setStart(target, 0)

  const anchor = getFirstElementAncestor(target, stopRoot)
  const spacing = anchor
    ? getAncestorsCombinedBottomSpacing(anchor, stopRoot)
    : 0
  const pageBottom = Math.floor(measureContainer.getBoundingClientRect().bottom)

  let previous = 0
  let tooFar = false
  let previousTooFar = false
  let index = len === 2 ? 1 : Math.round((len - 1) / 2)

  while (true) {
    index = Math.max(0, Math.min(index, len - 1))
    range.setEnd(target, index)

    previousTooFar = tooFar
    const bottom = Math.round(range.getBoundingClientRect().bottom + spacing)
    tooFar = bottom > pageBottom

    const distance = Math.abs(previous - index)
    if (distance < 3) {
      if (distance === 1) {
        if (tooFar && !previousTooFar) return previous
        if (!tooFar && previousTooFar) return index
      }
      if (distance === 0) {
        return index === len - 1 ? index : -1
      }

      previous = index
      index += tooFar ? -1 : 1
      continue
    }

    const halfDistance = Math.round(distance / 2)
    previous = index
    index += tooFar ? -halfDistance : halfDistance
  }
}

function shouldBreak(node: Node): "avoid-inside" | "before" | "after" | null {
  if (!(node instanceof Element)) return null

  const tagName = node.tagName.toLowerCase()
  if (tagName === "tr") {
    return "avoid-inside"
  }

  const styles = window.getComputedStyle(node)
  const breakInside = styles.getPropertyValue("break-inside")
  if (
    BREAK_AVOID_VALUES.has(breakInside) &&
    tagName !== "p" &&
    tagName !== "li" &&
    tagName !== "blockquote"
  ) {
    return "avoid-inside"
  }

  const breakBefore = styles.getPropertyValue("break-before")
  if (BREAK_FORCE_VALUES.has(breakBefore)) {
    return "before"
  }

  const breakAfter = styles.getPropertyValue("break-after")
  if (BREAK_FORCE_VALUES.has(breakAfter)) {
    return "after"
  }

  return null
}

function getFirstElementAncestor(
  node: Node,
  stopRoot: HTMLElement,
): HTMLElement | null {
  let current: Node | null = node.parentNode
  while (current && current !== stopRoot) {
    if (current instanceof HTMLElement) return current
    current = current.parentNode
  }
  return stopRoot
}

function getAncestorsCombinedBottomSpacing(
  element: HTMLElement,
  stopRoot: HTMLElement,
): number {
  let current: HTMLElement | null = element
  let spacing = 0
  while (current && current !== stopRoot) {
    spacing += getBottomSpacing(current)
    current = current.parentElement
  }
  return spacing
}

function getBottomSpacing(element: HTMLElement): number {
  const style = window.getComputedStyle(element)
  const padding =
    Number.parseFloat(style.getPropertyValue("padding-bottom")) || 0
  const margin = Number.parseFloat(style.getPropertyValue("margin-bottom")) || 0
  return padding + margin
}

function getTextRect(text: Text): DOMRect {
  const range = text.ownerDocument.createRange()
  range.selectNode(text)
  return range.getBoundingClientRect()
}

function createRootStartLocation(root: HTMLElement): SourceLocation {
  return { node: root, offset: 0 }
}

function isSameLocation(a: SourceLocation, b: SourceLocation): boolean {
  return a.node === b.node && a.offset === b.offset
}

function advanceSourceLocation(
  root: HTMLElement,
  location: SourceLocation,
): SourceLocation | null {
  if (location.node.nodeType === Node.TEXT_NODE) {
    const len = location.node.textContent?.length ?? 0
    if (location.offset < len) {
      return {
        node: location.node,
        offset: location.offset + 1,
      }
    }
  }

  const next = getNextNodeAfterSubtree(root, location.node)
  if (!next) return null
  return { node: next, offset: 0 }
}

function getNextNodeAfterSubtree(root: HTMLElement, node: Node): Node | null {
  let current: Node | null = node
  while (current && current !== root) {
    if (current.nextSibling) return current.nextSibling
    current = current.parentNode
  }
  return null
}

function countNodes(root: Node): number {
  let count = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL)
  let current: Node | null = walker.currentNode
  while (current) {
    count += 1
    current = walker.nextNode()
  }
  return count
}

function applyTypography(
  element: HTMLElement,
  typography: ReaderTypographyConfig,
): void {
  const { fontFamily, fontSize, lineHeight, paddingX } = typography
  element.style.fontFamily = fontFamily
  element.style.fontSize = `${fontSize}px`
  element.style.lineHeight = String(lineHeight)
  element.style.letterSpacing = "0.01em"
  element.style.color = "var(--reader-fg)"
  element.style.setProperty("--reader-padding-x", `${paddingX}rem`)
  element.style.setProperty("--reader-font-family", fontFamily)
  element.style.setProperty("--reader-font-size", `${fontSize}px`)
  element.style.setProperty("--reader-line-height", String(lineHeight))
  element.style.setProperty("--reader-letter-spacing", "0.01em")
}

/**
 * DOM 环境下对 {@link TextChapterData} 做测量分页，结果写入 {@link ProgressivePaginator}。
 */
export class DomReflowEngine implements ReflowLayoutEngine {
  async layoutChapter(
    chapter: TextChapterData,
    config: LayoutConfig,
    options: DomReflowLayoutOptions,
  ) {
    return layoutTextChapterAtMeasureHost(
      chapter,
      config,
      options.measureHost,
      options.paginator,
    )
  }
}

export const defaultDomReflowEngine = new DomReflowEngine()
