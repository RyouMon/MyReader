import { fillRangeStartFromBoundary } from "@/lib/rendition/pagination/ProgressivePaginator"
import type { TextChapterData } from "@/lib/rendition/types"

import type { BookAnchor } from "./BookAnchor"
import { readingBoundaryFromRootUtf16Offset } from "./epubBookAnchor"

const BODY_SELECTOR = ".reader-body-content"

function utf16OffsetBeforeNodeInBody(bodyRoot: HTMLElement, node: Node): number {
  const doc = bodyRoot.ownerDocument
  if (!bodyRoot.contains(node)) return 0
  const pre = doc.createRange()
  try {
    pre.selectNodeContents(bodyRoot)
    pre.setEnd(node, 0)
    return pre.toString().length
  } catch {
    return 0
  }
}

function scrollRectIntoScrollContainer(
  scrollRoot: HTMLElement,
  rect: DOMRect,
): void {
  const sr = scrollRoot.getBoundingClientRect()
  scrollRoot.scrollTop += rect.top - sr.top - 24
}

function scrollNodeIntoScrollContainer(
  scrollRoot: HTMLElement,
  node: Node,
): void {
  const el =
    node.nodeType === Node.TEXT_NODE
      ? (node.parentElement as HTMLElement | null)
      : (node as HTMLElement)
  if (!el?.getBoundingClientRect) return
  const er = el.getBoundingClientRect()
  if (er.width === 0 && er.height === 0) return
  scrollRectIntoScrollContainer(scrollRoot, er)
}

/**
 * 从滚动视口可见区上方采样点解析 {@link BookAnchor}（章内 UTF-16 与分页/持久化一致）。
 * 纯图区域 `caretRangeFromPoint` 可能为 null，会回退到 `elementsFromPoint`。
 */
export function bookAnchorFromScrollViewport(
  scrollRoot: HTMLElement,
): BookAnchor | null {
  const sr = scrollRoot.getBoundingClientRect()
  const x = sr.left + sr.width / 2
  const y = sr.top + Math.min(96, Math.max(8, sr.height * 0.12))
  const doc = scrollRoot.ownerDocument

  const caret = doc.caretRangeFromPoint?.(x, y) ?? null
  if (caret) {
    const fromCaret = anchorFromCaretInScrollRoot(scrollRoot, caret)
    if (fromCaret) return fromCaret
  }

  return anchorFromElementsAtPoint(scrollRoot, x, y)
}

function anchorFromCaretInScrollRoot(
  scrollRoot: HTMLElement,
  caret: Range,
): BookAnchor | null {
  const doc = scrollRoot.ownerDocument
  let node: Node | null = caret.startContainer
  let section: Element | null = null
  while (node) {
    if (node instanceof Element && node.hasAttribute("data-chapter-index")) {
      section = node
      break
    }
    node = node.parentNode
  }
  if (!section) return null

  const rawIdx = section.getAttribute("data-chapter-index")
  const chapterIndex = rawIdx != null ? Number.parseInt(rawIdx, 10) : NaN
  if (!Number.isFinite(chapterIndex)) return null

  const bodyRoot = section.querySelector(BODY_SELECTOR)
  if (!(bodyRoot instanceof HTMLElement)) {
    return { chapterIndex }
  }

  const pre = doc.createRange()
  try {
    pre.selectNodeContents(bodyRoot)
    pre.setEnd(caret.startContainer, caret.startOffset)
  } catch {
    return { chapterIndex }
  }

  const charOffset = pre.toString().length
  return { chapterIndex, charOffset }
}

function anchorFromElementsAtPoint(
  scrollRoot: HTMLElement,
  x: number,
  y: number,
): BookAnchor | null {
  const doc = scrollRoot.ownerDocument
  const stack = doc.elementsFromPoint(x, y)
  for (const el of stack) {
    if (!(el instanceof Element)) continue
    const section = el.closest("[data-chapter-index]")
    if (!section) continue
    const bodyRoot = section.querySelector(BODY_SELECTOR)
    if (!(bodyRoot instanceof HTMLElement)) continue
    if (!bodyRoot.contains(el)) continue
    if (el === bodyRoot || el === section) continue
    const rawIdx = section.getAttribute("data-chapter-index")
    const chapterIndex =
      rawIdx != null ? Number.parseInt(rawIdx, 10) : Number.NaN
    if (!Number.isFinite(chapterIndex)) continue
    return {
      chapterIndex,
      charOffset: utf16OffsetBeforeNodeInBody(bodyRoot, el),
    }
  }
  return null
}

/**
 * 将滚动容器滚动到与 {@link BookAnchor} 对齐（`charOffset` 相对该章 `.reader-body-content` 子树文档序 UTF-16）。
 */
export function scrollScrollContainerToBookAnchor(
  scrollRoot: HTMLElement,
  anchor: BookAnchor,
): void {
  const idx = Math.max(0, Math.floor(anchor.chapterIndex))
  const section = scrollRoot.querySelector<HTMLElement>(
    `[data-chapter-index="${idx}"]`,
  )
  if (!section) return

  const bodyRoot = section.querySelector(BODY_SELECTOR)
  if (!(bodyRoot instanceof HTMLElement)) {
    section.scrollIntoView({ block: "start", behavior: "instant" })
    return
  }

  if (anchor.charOffset == null || !Number.isFinite(anchor.charOffset)) {
    section.scrollIntoView({ block: "start", behavior: "instant" })
    return
  }

  const co = Math.max(0, Math.floor(anchor.charOffset))
  const boundary = readingBoundaryFromRootUtf16Offset(bodyRoot, co)
  const range = scrollRoot.ownerDocument.createRange()
  try {
    fillRangeStartFromBoundary(range, bodyRoot, boundary)
    range.collapse(true)
  } catch {
    section.scrollIntoView({ block: "start", behavior: "instant" })
    return
  }

  const rr = range.getBoundingClientRect()
  if (rr.width > 0 || rr.height > 0) {
    scrollRectIntoScrollContainer(scrollRoot, rr)
    return
  }

  let n: Node | null = range.startContainer
  if (n.nodeType === Node.TEXT_NODE) n = n.parentElement
  if (n instanceof Element) {
    const media = n.closest("img, picture, figure, svg, video")
    if (media instanceof HTMLElement) {
      const mr = media.getBoundingClientRect()
      if (mr.width > 0 || mr.height > 0) {
        scrollRectIntoScrollContainer(scrollRoot, mr)
        return
      }
    }
  }

  scrollNodeIntoScrollContainer(scrollRoot, range.startContainer)
  const after = range.getBoundingClientRect()
  if (after.width > 0 || after.height > 0) {
    scrollRectIntoScrollContainer(scrollRoot, after)
    return
  }

  const fallback = bodyRoot.querySelector("img, picture, figure, svg, video")
  if (fallback instanceof HTMLElement) {
    const fr = fallback.getBoundingClientRect()
    if (fr.width > 0 || fr.height > 0) {
      scrollRectIntoScrollContainer(scrollRoot, fr)
      return
    }
  }
  section.scrollIntoView({ block: "start", behavior: "instant" })
}

/**
 * 无 caret 采样时的回退：用章内比例估算 UTF-16 偏移（与 body 长度一致时接近视觉位置）。
 */
export function fallbackBookAnchorFromFraction(
  chapterIndex: number,
  withinChapterFraction: number,
  chapter: TextChapterData | undefined,
): BookAnchor {
  const idx = Math.max(0, Math.floor(chapterIndex))
  if (!chapter) return { chapterIndex: idx }
  const len = Math.max(
    0,
    chapter.bodyUtf16Length ?? chapter.text?.length ?? 0,
  )
  if (len <= 0) return { chapterIndex: idx }
  const f = Math.max(0, Math.min(1, withinChapterFraction))
  const charOffset = Math.min(len - 1, Math.round(f * len))
  return { chapterIndex: idx, charOffset }
}
