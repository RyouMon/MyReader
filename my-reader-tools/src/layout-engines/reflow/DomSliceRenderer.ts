import type { DomPageSlice, TextChapterData } from "../../types"
import { scopeEpubCss } from "../../utils/reader"
import { applyRangeBoundary } from "./DomBoundaryMapper"

export const READER_TYPOGRAPHY_OVERRIDE_CSS = `
.reader-epub-scope,
.reader-epub-scope *:not(pre):not(code):not(kbd):not(samp) {
  font-family: var(--reader-font-family) !important;
  font-size: var(--reader-font-size) !important;
  line-height: var(--reader-line-height) !important;
  letter-spacing: var(--reader-letter-spacing) !important;
}
`.trim()

/** Appends the reader typography override style block. */
export function appendReaderTypographyStyle(host: HTMLElement): void {
  const style = document.createElement("style")
  style.setAttribute("data-reader-typography", "")
  style.textContent = READER_TYPOGRAPHY_OVERRIDE_CSS
  host.appendChild(style)
}

/** Injects EPUB CSS and reader typography overrides into a host element. */
export function appendScopedStyles(host: HTMLElement, rawCss: string): void {
  const scopedCss = rawCss ? scopeEpubCss(rawCss) : ""
  if (scopedCss) {
    const style = document.createElement("style")
    style.textContent = scopedCss
    host.appendChild(style)
  }
  appendReaderTypographyStyle(host)
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
