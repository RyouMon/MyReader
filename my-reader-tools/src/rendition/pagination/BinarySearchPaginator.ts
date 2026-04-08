import type {
  IPaginator,
  LayoutConfig,
  PageData,
  ReaderTypographyConfig,
  TextChapterData,
} from "../types"
import { scopeEpubCss } from "../utils"

export interface PageSlice {
  start: number
  end: number
}

function isInsideStyleElement(node: Node): boolean {
  let p: Node | null = node.parentNode
  while (p) {
    if (p.nodeName === "STYLE") return true
    p = p.parentNode
  }
  return false
}

export function collectTextNodes(root: Element): Text[] {
  const out: Text[] = []
  const doc = root.ownerDocument
  if (!doc) return out
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n: Node | null = walker.nextNode()
  while (n) {
    const t = n as Text
    if (t.length > 0 && !isInsideStyleElement(t)) out.push(t)
    n = walker.nextNode()
  }
  return out
}

export function globalToBoundary(
  texts: Text[],
  global: number,
): { node: Text; offset: number } {
  if (texts.length === 0) {
    throw new Error("globalToBoundary: empty text list")
  }
  const total = texts.reduce((s, t) => s + t.length, 0)
  const g = Math.max(0, Math.min(global, total))
  if (g === 0) {
    return { node: texts[0], offset: 0 }
  }
  let acc = 0
  for (const t of texts) {
    const len = t.length
    if (acc + len >= g) {
      return { node: t, offset: g - acc }
    }
    acc += len
  }
  const last = texts[texts.length - 1]
  return { node: last, offset: last.length }
}

export function setRangeToGlobalBoundaries(
  range: Range,
  texts: Text[],
  start: number,
  end: number,
): void {
  const total = texts.reduce((s, t) => s + t.length, 0)
  const s = Math.max(0, Math.min(start, total))
  const e = Math.max(s, Math.min(end, total))
  const a = globalToBoundary(texts, s)
  const b = globalToBoundary(texts, e)
  range.setStart(a.node, a.offset)
  range.setEnd(b.node, b.offset)
}

export function findLargestEnd(
  start: number,
  total: number,
  maxHeight: number,
  measure: (start: number, end: number) => number,
): number {
  if (start >= total) return total
  if (measure(start, total) <= maxHeight) return total
  if (measure(start, start + 1) > maxHeight) return start + 1

  let lo = start + 1
  let hi = total
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(start, mid) <= maxHeight) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function sliceIntoPages(
  totalChars: number,
  maxHeight: number,
  measure: (start: number, end: number) => number,
): PageSlice[] {
  const pages: PageSlice[] = []
  let start = 0
  while (start < totalChars) {
    const end = findLargestEnd(start, totalChars, maxHeight, measure)
    if (end <= start) {
      pages.push({ start, end: start + 1 })
      start += 1
    } else {
      pages.push({ start, end })
      start = end
    }
  }
  return pages
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

export interface TextChapterPaginationResult {
  mode: "sliced" | "full"
  pages: PageSlice[]
  pageCount: number
  sourceRoot: HTMLDivElement | null
  texts: Text[]
}

const READER_CHAPTER_ROOT_CLASS =
  "reader-chapter-container reader-paginated-container reader-measure-paginate reader-body-content"

interface BinarySearchPaginatorInput {
  chapter: TextChapterData
  totalChars: number
  measure: (start: number, end: number) => number
}

/** Binary-search paginator for text chapters (measure callback + DOM helpers). */
export class BinarySearchPaginator
  implements IPaginator<BinarySearchPaginatorInput, PageData>
{
  private pages: PageSlice[] = []
  private currentOffset = 0
  private chapter: TextChapterData | null = null

  curPage: PageData | null = null
  prevPage: PageData | null = null
  nextPage: PageData | null = null

  async layout(
    content: BinarySearchPaginatorInput,
    config: LayoutConfig,
  ): Promise<void> {
    this.chapter = content.chapter
    this.pages = this.createSlices(
      content.totalChars,
      config.viewPortHeight,
      content.measure,
    )
    this.currentOffset = 0
    this.syncPointers()
  }

  async gotoPage(offset: number): Promise<void> {
    if (this.pages.length <= 0) return
    this.currentOffset = Math.max(0, Math.min(offset, this.pages.length - 1))
    this.syncPointers()
  }

  async gotoNextPage(): Promise<void> {
    await this.gotoPage(this.currentOffset + 1)
  }

  async gotoPrevPage(): Promise<void> {
    await this.gotoPage(this.currentOffset - 1)
  }

  async clearCache(): Promise<void> {
    this.pages = []
    this.chapter = null
    this.currentOffset = 0
    this.curPage = null
    this.prevPage = null
    this.nextPage = null
  }

  getCurrentSlice(): PageSlice | null {
    if (this.pages.length <= 0) return null
    return this.pages[this.currentOffset] ?? null
  }

  getAllSlices(): PageSlice[] {
    return this.pages
  }

  private createSlices(
    totalChars: number,
    maxHeight: number,
    measure: (start: number, end: number) => number,
  ): PageSlice[] {
    const pages: PageSlice[] = []
    let start = 0
    while (start < totalChars) {
      const end = findLargestEnd(start, totalChars, maxHeight, measure)
      const safeEnd = end <= start ? start + 1 : end
      pages.push({ start, end: safeEnd })
      start = safeEnd
    }
    return pages
  }

  private syncPointers(): void {
    const current = this.buildPage(this.currentOffset)
    this.curPage = current
    this.prevPage = this.buildPage(this.currentOffset - 1)
    this.nextPage = this.buildPage(this.currentOffset + 1)
  }

  private buildPage(offset: number): PageData | null {
    if (!this.chapter) return null
    const slice = this.pages[offset]
    if (!slice) return null
    return {
      index: offset,
      chapter: this.chapter.index,
      columns: [`${slice.start}:${slice.end}`],
      isStartOfChapter: offset === 0,
      isEndOfChapter: offset === this.pages.length - 1,
    }
  }
}

/**
 * 在隐藏测量容器中切分指定章，并写入 {@link BinarySearchPaginator}。
 * 由 {@link BookReader.layout} 调用；UI 不应直接调用。
 */
export async function layoutTextChapterAtMeasureHost(
  chapter: TextChapterData,
  config: LayoutConfig,
  measureHost: HTMLDivElement,
  paginator: BinarySearchPaginator,
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
  const sourceRoot = buildChapterRoot(chapter)
  applyTypography(sourceRoot, typography)

  const measureRoot = document.createElement("div")
  measureRoot.className = READER_CHAPTER_ROOT_CLASS
  applyTypography(measureRoot, typography)

  measureHost.style.width = `${width}px`
  measureHost.style.position = "absolute"
  measureHost.style.left = "-9999px"
  measureHost.style.top = "0"
  measureHost.style.visibility = "hidden"
  measureHost.style.pointerEvents = "none"
  measureHost.appendChild(sourceRoot)
  measureHost.appendChild(measureRoot)

  const texts = collectTextNodes(sourceRoot)
  const totalChars = texts.reduce((sum, t) => sum + t.length, 0)
  if (totalChars === 0) {
    measureHost.replaceChildren()
    return {
      mode: "full",
      pages: [],
      pageCount: 1,
      sourceRoot: null,
      texts: [],
    }
  }

  const measure = (start: number, end: number): number => {
    measureRoot.replaceChildren()
    const rawCss = chapter.cssText ?? ""
    const scopedCss = rawCss ? scopeEpubCss(rawCss) : ""
    if (scopedCss) {
      const st = document.createElement("style")
      st.textContent = scopedCss
      measureRoot.appendChild(st)
    }
    appendReaderTypographyStyle(measureRoot)
    const scope = document.createElement("div")
    scope.className = "reader-epub-scope"
    const range = document.createRange()
    setRangeToGlobalBoundaries(range, texts, start, end)
    scope.appendChild(range.cloneContents())
    measureRoot.appendChild(scope)
    return measureRoot.scrollHeight
  }

  await paginator.layout({ chapter, totalChars, measure }, config)
  const pages = paginator.getAllSlices()
  measureHost.replaceChildren()
  return {
    mode: "sliced",
    pages,
    pageCount: Math.max(1, pages.length),
    sourceRoot,
    texts,
  }
}

export function renderTextChapterPage(
  display: HTMLElement,
  chapter: TextChapterData,
  mode: "sliced" | "full",
  pages: PageSlice[],
  pageIndex: number,
  sourceRoot: HTMLDivElement | null,
  texts: Text[],
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
  if (!slice || !sourceRoot || texts.length === 0) {
    display.replaceChildren()
    return
  }

  display.replaceChildren()
  const rawCss = chapter.cssText ?? ""
  const scopedCss = rawCss ? scopeEpubCss(rawCss) : ""
  if (scopedCss) {
    const st = document.createElement("style")
    st.textContent = scopedCss
    display.appendChild(st)
  }
  appendReaderTypographyStyle(display)
  const scope = document.createElement("div")
  scope.className = "reader-epub-scope"
  const range = document.createRange()
  setRangeToGlobalBoundaries(range, texts, slice.start, slice.end)
  scope.appendChild(range.cloneContents())
  display.appendChild(scope)
}

function buildChapterRoot(chapter: TextChapterData): HTMLDivElement {
  const root = document.createElement("div")
  root.className = READER_CHAPTER_ROOT_CLASS
  const raw = chapter.cssText ?? ""
  const scoped = raw ? scopeEpubCss(raw) : ""
  const epubStyle = scoped ? `<style>${scoped}</style>` : ""
  const readerStyle = `<style data-reader-typography>${READER_TYPOGRAPHY_OVERRIDE_CSS}</style>`
  root.innerHTML = `${epubStyle}${readerStyle}<div class="reader-epub-scope">${chapter.bodyHtml}</div>`
  return root
}

function applyTypography(
  el: HTMLElement,
  typography: ReaderTypographyConfig,
): void {
  const { fontFamily, fontSize, lineHeight, paddingX } = typography
  el.style.fontFamily = fontFamily
  el.style.fontSize = `${fontSize}px`
  el.style.lineHeight = String(lineHeight)
  el.style.letterSpacing = "0.01em"
  el.style.color = "var(--reader-fg)"
  el.style.setProperty("--reader-padding-x", `${paddingX}rem`)
  el.style.setProperty("--reader-font-family", fontFamily)
  el.style.setProperty("--reader-font-size", `${fontSize}px`)
  el.style.setProperty("--reader-line-height", String(lineHeight))
  el.style.setProperty("--reader-letter-spacing", "0.01em")
}

function appendReaderTypographyStyle(host: HTMLElement): void {
  const ov = document.createElement("style")
  ov.setAttribute("data-reader-typography", "")
  ov.textContent = READER_TYPOGRAPHY_OVERRIDE_CSS
  host.appendChild(ov)
}
