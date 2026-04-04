import {
  fillRangeStartFromBoundary,
  readingAnchorForRangeStart,
} from "@/lib/rendition/pagination/ProgressivePaginator"
import type { RangeBoundary, TextChapterData } from "@/lib/rendition/types"

import type { BookAnchor } from "./BookAnchor"

const SNIPPET_BEFORE = 96
const SNIPPET_AFTER = 64

function syntheticBodyDocument(bodyHtml: string): Document {
  const xml = `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/></head><body>${bodyHtml}</body></html>`
  return new DOMParser().parseFromString(xml, "application/xhtml+xml")
}

function utf16OffsetBeforeRangeStart(root: HTMLElement, point: Range): number {
  const pre = root.ownerDocument.createRange()
  pre.selectNodeContents(root)
  pre.setEnd(point.startContainer, point.startOffset)
  return pre.toString().length
}

/**
 * 与 {@link utf16OffsetBeforeRangeStart} 互逆：在 `root` 子树按文档序遍历文本节点，
 * 定位 UTF-16 码元偏移处的 Range 起点并序列化为 {@link RangeBoundary}。
 */
export function readingBoundaryFromRootUtf16Offset(
  root: HTMLElement,
  utf16Offset: number,
): RangeBoundary {
  const doc = root.ownerDocument
  const range = doc.createRange()
  const target = Math.max(0, Math.floor(utf16Offset))
  let remaining = target
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null = walker.nextNode()
  while (node) {
    const text = node.textContent ?? ""
    const len = text.length
    if (remaining < len) {
      range.setStart(node, remaining)
      range.collapse(true)
      return readingAnchorForRangeStart(root, range)
    }
    remaining -= len
    node = walker.nextNode()
  }
  range.selectNodeContents(root)
  range.collapse(false)
  return readingAnchorForRangeStart(root, range)
}

/** 在章节 XHTML body 上与保存锚点时相同的合成文档中解析 `charOffset`（相对该章 `body` 文本，UTF-16）。 */
export function epubReadingBoundaryFromChapterCharOffset(
  chapter: TextChapterData,
  charOffset: number,
): RangeBoundary | null {
  const doc = syntheticBodyDocument(chapter.bodyHtml)
  const body = doc.body
  if (!body) return null
  return readingBoundaryFromRootUtf16Offset(body, charOffset)
}

function snippetsAround(
  corpus: string,
  charOffset: number,
): Pick<BookAnchor, "textSnippet" | "textSnippetAfter"> {
  const o = Math.max(0, Math.min(charOffset, corpus.length))
  const beforeRaw = corpus.slice(Math.max(0, o - SNIPPET_BEFORE), o)
  const afterRaw = corpus.slice(o, Math.min(corpus.length, o + SNIPPET_AFTER))
  const textSnippet = beforeRaw.trim() || undefined
  const textSnippetAfter = afterRaw.trim() || undefined
  return { textSnippet, textSnippetAfter }
}

/**
 * 由章内 {@link RangeBoundary} 得到可持久化的 {@link BookAnchor}：
 * `charOffset` 为相对该章 body 子树文本的 UTF-16 偏移，与 {@link epubReadingBoundaryFromChapterCharOffset} 一致。
 */
export function buildTextChapterBookAnchorAtBoundary(params: {
  chapter: TextChapterData
  boundary: RangeBoundary
}): BookAnchor {
  const { chapter, boundary } = params
  const doc = syntheticBodyDocument(chapter.bodyHtml)
  const body = doc.body
  if (!body) {
    return { chapterIndex: chapter.index, charOffset: 0 }
  }

  const range = doc.createRange()
  fillRangeStartFromBoundary(range, body, boundary)
  range.collapse(true)

  const charOffset = utf16OffsetBeforeRangeStart(body, range)
  const corpus = body.textContent ?? ""

  return {
    chapterIndex: chapter.index,
    charOffset,
    ...snippetsAround(corpus, charOffset),
  }
}
