import type {
  DomPageSlice,
  IPaginator,
  LayoutConfig,
  PageData,
  RangeBoundary,
  ReaderTypographyConfig,
  TextChapterData,
  TextChapterPaginationResult,
} from "../types"
import { scopeEpubCss } from "../utils"

interface ProgressivePaginatorInput {
  chapter: TextChapterData
  pages: DomPageSlice[]
}

interface SourceLocation {
  node: Node
  offset: number
}

interface AppendedNodeState {
  node?: Node
  target?: Node
  depth: number
}

interface ClonedAncestorTree {
  tree: Node | null
  innerMost: Node | null
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

/**
 * Waits until an img has bitmap dimensions so overflow math matches on-screen layout.
 * Pagination used to treat undecoded images as ~0px tall and kept appending siblings on the same page.
 */
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

/** Warms the HTTP cache for every image in the hidden source tree before measuring pages. */
async function preloadImagesForPagination(root: HTMLElement): Promise<void> {
  const imgs = root.querySelectorAll("img")
  if (imgs.length === 0) return
  await Promise.all([...imgs].map((img) => ensureImageDrawable(img)))
}

/**
 * Laid-out column height (container top → measure root bottom). ebook-paginator uses
 * `heightAdded += target.offsetHeight`, which stays ~0 when most nodes are Text (no offsetHeight);
 * syncing from geometry fixes false `heightAdded <= 1` and stops spurious “force fit” on images.
 */
function syncLaidOutColumnHeight(
  measureRoot: HTMLElement,
  measureContainer: HTMLElement,
): number {
  return Math.round(
    measureRoot.getBoundingClientRect().bottom -
      measureContainer.getBoundingClientRect().top,
  )
}

export const READER_TYPOGRAPHY_OVERRIDE_CSS = `
.reader-epub-scope,
.reader-epub-scope *:not(pre):not(code):not(kbd):not(samp) {
  font-family: var(--reader-font-family) !important;
  font-size: var(--reader-font-size) !important;
  line-height: var(--reader-line-height) !important;
  letter-spacing: var(--reader-letter-spacing) !important;
}
`.trim()

/** Progressive DOM paginator inspired by ebook-paginator's page-fill model. */
export class ProgressivePaginator
  implements IPaginator<ProgressivePaginatorInput, PageData>
{
  private pages: DomPageSlice[] = []
  private currentOffset = 0
  private chapter: TextChapterData | null = null

  curPage: PageData | null = null
  prevPage: PageData | null = null
  nextPage: PageData | null = null

  /** Hydrates the paginator with precomputed page boundaries. */
  async layout(
    content: ProgressivePaginatorInput,
    _config: LayoutConfig,
  ): Promise<void> {
    this.chapter = content.chapter
    this.pages = content.pages
    this.currentOffset = 0
    this.syncPointers()
  }

  /** Moves to an in-chapter page offset. */
  async gotoPage(offset: number): Promise<void> {
    if (this.pages.length <= 0) return
    this.currentOffset = Math.max(0, Math.min(offset, this.pages.length - 1))
    this.syncPointers()
  }

  /** Advances one page when possible. */
  async gotoNextPage(): Promise<void> {
    await this.gotoPage(this.currentOffset + 1)
  }

  /** Moves back one page when possible. */
  async gotoPrevPage(): Promise<void> {
    await this.gotoPage(this.currentOffset - 1)
  }

  /** Drops all cached page boundaries and page pointers. */
  async clearCache(): Promise<void> {
    this.pages = []
    this.chapter = null
    this.currentOffset = 0
    this.curPage = null
    this.prevPage = null
    this.nextPage = null
  }

  /** Returns the current page slice. */
  getCurrentSlice(): DomPageSlice | null {
    if (this.pages.length <= 0) return null
    return this.pages[this.currentOffset] ?? null
  }

  /** Returns all measured slices for the current chapter. */
  getAllSlices(): DomPageSlice[] {
    return this.pages
  }

  /** Synchronizes public page pointers from the internal offset. */
  private syncPointers(): void {
    this.curPage = this.buildPage(this.currentOffset)
    this.prevPage = this.buildPage(this.currentOffset - 1)
    this.nextPage = this.buildPage(this.currentOffset + 1)
  }

  /** Builds a stable page descriptor for the requested page offset. */
  private buildPage(offset: number): PageData | null {
    if (!this.chapter) return null
    const slice = this.pages[offset]
    if (!slice) return null
    return {
      index: offset,
      chapter: this.chapter.index,
      columns: [
        serializeBoundaryForDebug(slice.start),
        serializeBoundaryForDebug(slice.end),
      ],
      isStartOfChapter: offset === 0,
      isEndOfChapter: offset === this.pages.length - 1,
    }
  }
}

/** Measures a chapter in a hidden host and stores slices into the paginator. */
export async function layoutTextChapterAtMeasureHost(
  chapter: TextChapterData,
  config: LayoutConfig,
  measureHost: HTMLDivElement,
  paginator: ProgressivePaginator,
): Promise<TextChapterPaginationResult> {
  const width = config.viewPortWidth
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

/** Renders the requested page by cloning the stored DOM range. */
export function renderTextChapterPage(
  display: HTMLElement,
  chapter: TextChapterData,
  mode: "sliced" | "full",
  pages: DomPageSlice[],
  pageIndex: number,
  sourceRoot: HTMLDivElement | null,
  _texts: Text[],
): void {
  if (mode === "full") {
    const raw = chapter.cssText ?? ""
    const scopedCss = raw ? scopeEpubCss(raw) : ""
    const epubStyle = scopedCss ? `<style>${scopedCss}</style>` : ""
    const readerStyle = `<style data-reader-typography>${READER_TYPOGRAPHY_OVERRIDE_CSS}</style>`
    display.innerHTML = `${epubStyle}${readerStyle}<div class="reader-epub-scope">${chapter.bodyHtml}</div>`
    return
  }

  const slice = pages[pageIndex]
  if (!slice || !sourceRoot) {
    display.replaceChildren()
    return
  }

  display.replaceChildren()
  appendScopedStyles(display, chapter.cssText ?? "")

  const scope = document.createElement("div")
  scope.className = "reader-epub-scope"

  const range = document.createRange()
  applyRangeBoundary(range, sourceRoot, slice.start, true)
  applyRangeBoundary(range, sourceRoot, slice.end, false)
  scope.appendChild(range.cloneContents())
  display.appendChild(scope)
}

/** Serializes a page boundary into a short debug string. */
function serializeBoundaryForDebug(boundary: RangeBoundary): string {
  const path = boundary.path.join(".")
  const kind = boundary.isText ? "t" : "n"
  return `${kind}:${path}:${boundary.offset}`
}

/** Builds the attached source DOM used as the canonical content tree. */
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

/** Builds an empty measure tree that mirrors the source chapter wrappers. */
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

/** Injects EPUB CSS and reader typography overrides into a host element. */
function appendScopedStyles(host: HTMLElement, rawCss: string): void {
  const scopedCss = rawCss ? scopeEpubCss(rawCss) : ""
  if (scopedCss) {
    const style = document.createElement("style")
    style.textContent = scopedCss
    host.appendChild(style)
  }
  appendReaderTypographyStyle(host)
}

/** Paginates the source DOM by progressively filling the measure DOM. */
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

/** Fills the measure page once and returns the next page's start location. */
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

    // ebook-paginator/index.js: only shrink a lone overflowing block when almost nothing
    // else is on the page (`heightAdded <= 1`). Otherwise remove the node and continue on
    // the next page — critical for “paragraphs + tall img” so the image is not squeezed
    // onto the same slice as following text.
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

/** Clones the next source node into the equivalent target position. */
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

/** Rebuilds ancestor wrappers from the source node back to the root. */
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

/** Returns whether the appended target node overflowed the visible page box. */
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

/** Uses binary search to find the last fitting character inside a text node. */
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

/** Returns break directives relevant for pagination on the current node. */
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

/** Finds the first element ancestor up to the provided stop root. */
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

/** Sums bottom margin and padding across ancestors until the stop root. */
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

/** Reads bottom spacing used by the overflow calculation. */
function getBottomSpacing(element: HTMLElement): number {
  const style = window.getComputedStyle(element)
  const padding =
    Number.parseFloat(style.getPropertyValue("padding-bottom")) || 0
  const margin = Number.parseFloat(style.getPropertyValue("margin-bottom")) || 0
  return padding + margin
}

/** Reads a text node's rendered rectangle through a live DOM range. */
function getTextRect(text: Text): DOMRect {
  const range = text.ownerDocument.createRange()
  range.selectNode(text)
  return range.getBoundingClientRect()
}

/** Creates the initial location at the start of the source content root. */
function createRootStartLocation(root: HTMLElement): SourceLocation {
  return { node: root, offset: 0 }
}

/** Creates the terminal range boundary at the end of the source content root. */
function createRootEndBoundary(root: HTMLElement): RangeBoundary {
  return {
    path: [],
    offset: root.childNodes.length,
    isText: false,
  }
}

/** Serializes a source location into a DOM range boundary. */
function serializeLocationAsBoundary(
  root: HTMLElement,
  location: SourceLocation,
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
function applyRangeBoundary(
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

/**
 * After typography or viewport reflow, finds which new page still shows the same
 * document position. Same idea as ebook-paginator `redraw(true)`: keep the current
 * page start (node + offset) and re-paginate from there.
 */
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
    return 0
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

/** Resolves a serialized child-index path back into a live DOM node. */
function resolveNodePath(root: Node, path: number[]): Node | null {
  let current: Node | null = root
  for (const index of path) {
    current = current?.childNodes.item(index) ?? null
    if (!current) return null
  }
  return current
}

/** Serializes a node into child indexes relative to the provided root. */
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

/** Returns a node's index inside its parent's childNodes list. */
function getChildIndex(node: Node): number {
  const parent = node.parentNode
  if (!parent) return 0
  return Array.prototype.indexOf.call(parent.childNodes, node) as number
}

/** Checks whether two source locations point to the same position. */
function isSameLocation(a: SourceLocation, b: SourceLocation): boolean {
  return a.node === b.node && a.offset === b.offset
}

/** Advances a stuck source location to avoid infinite pagination loops. */
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

/** Finds the next source node after the current node's subtree. */
function getNextNodeAfterSubtree(root: HTMLElement, node: Node): Node | null {
  let current: Node | null = node
  while (current && current !== root) {
    if (current.nextSibling) return current.nextSibling
    current = current.parentNode
  }
  return null
}

/** Counts source nodes to cap the pagination loop in pathological cases. */
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

/** Applies the shared reader typography CSS variables to a host element. */
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

/** Appends the reader typography override style block. */
function appendReaderTypographyStyle(host: HTMLElement): void {
  const style = document.createElement("style")
  style.setAttribute("data-reader-typography", "")
  style.textContent = READER_TYPOGRAPHY_OVERRIDE_CSS
  host.appendChild(style)
}
