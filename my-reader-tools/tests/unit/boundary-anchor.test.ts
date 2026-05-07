import { describe, expect, it } from "vitest"
import {
  serializeLocationAsBoundary,
  sourceLocationFromBoundary,
  findPageIndexForReadingAnchor,
  createRootEndBoundary,
  applyRangeBoundary,
  readingAnchorForRangeStart,
} from "my-reader-tools/layout-engines/reflow"
import {
  readingBoundaryFromRootUtf16Offset,
  buildTextChapterBookAnchorAtBoundary,
  epubReadingBoundaryFromChapterCharOffset,
  clampChapterCharOffset,
} from "my-reader-tools/progress/epubBookAnchor"
import type { RangeBoundary, TextChapterData } from "my-reader-tools/types"

function makeChapter(bodyHtml: string): TextChapterData {
  return {
    type: "text",
    index: 0,
    title: "Test",
    href: "test.xhtml",
    bodyHtml,
    cssText: "",
    text: "",
    bodyUtf16Length: bodyHtml.length,
  }
}

describe("DomBoundaryMapper", () => {
  describe("serializeLocationAsBoundary ↔ sourceLocationFromBoundary", () => {
    it("round-trips root start", () => {
      const doc = document.createElement("div")
      doc.innerHTML = "<p>hello</p><p>world</p>"
      const start = { node: doc, offset: 0 }
      const boundary = serializeLocationAsBoundary(doc, start)
      expect(boundary).toEqual({ path: [], offset: 0, isText: false })

      const back = sourceLocationFromBoundary(doc, boundary)
      // root start resolves to the first child node, which is the correct
      // live-DOM interpretation of "before first child"
      expect(back?.node).toBe(doc.firstChild)
      expect(back?.offset).toBe(0)
    })

    it("round-trips text node with offset", () => {
      const doc = document.createElement("div")
      doc.innerHTML = "<p>hello world</p>"
      const textNode = doc.querySelector("p")!.firstChild as Text
      const loc = { node: textNode, offset: 6 }
      const boundary = serializeLocationAsBoundary(doc, loc)
      expect(boundary.isText).toBe(true)
      expect(boundary.offset).toBe(6)

      const back = sourceLocationFromBoundary(doc, boundary)
      expect(back).toEqual(loc)
    })

    it("round-trips element node", () => {
      const doc = document.createElement("div")
      doc.innerHTML = "<p>hello</p><span>world</span>"
      const span = doc.querySelector("span")!
      const loc = { node: span, offset: 0 }
      const boundary = serializeLocationAsBoundary(doc, loc)
      expect(boundary.isText).toBe(false)

      const back = sourceLocationFromBoundary(doc, boundary)
      expect(back?.node).toBe(span)
    })

    it("returns root-end when boundary offset is past children", () => {
      const doc = document.createElement("div")
      doc.innerHTML = "<p>hello</p>"
      const boundary: RangeBoundary = { path: [], offset: 999, isText: false }
      const back = sourceLocationFromBoundary(doc, boundary)
      expect(back?.node).toBe(doc)
      expect(back?.offset).toBe(doc.childNodes.length)
    })
  })

  describe("applyRangeBoundary", () => {
    it("sets range start on text node", () => {
      const doc = document.createElement("div")
      doc.innerHTML = "<p>hello world</p>"
      const range = document.createRange()
      const textNode = doc.querySelector("p")!.firstChild as Text
      const boundary: RangeBoundary = {
        path: [0, 0],
        offset: 6,
        isText: true,
      }
      applyRangeBoundary(range, doc, boundary, true)
      expect(range.startContainer).toBe(textNode)
      expect(range.startOffset).toBe(6)
    })

    it("falls back to root when path is invalid", () => {
      const doc = document.createElement("div")
      doc.innerHTML = "<p>hello</p>"
      const range = document.createRange()
      const boundary: RangeBoundary = { path: [99], offset: 0, isText: false }
      applyRangeBoundary(range, doc, boundary, true)
      expect(range.startContainer).toBe(doc)
      expect(range.startOffset).toBe(0)
    })
  })

  describe("findPageIndexForReadingAnchor", () => {
    it("returns 0 for empty pages", () => {
      const doc = document.createElement("div")
      expect(findPageIndexForReadingAnchor(doc, [], { path: [], offset: 0, isText: false })).toBe(0)
    })

    it("finds the correct page index for an anchor inside a slice", () => {
      const doc = document.createElement("div")
      doc.innerHTML = "<p id='a'>page1</p><p id='b'>page2</p><p id='c'>page3</p>"
      const pA = doc.querySelector("#a")!
      const pB = doc.querySelector("#b")!
      const pC = doc.querySelector("#c")!

      const pages = [
        {
          start: serializeLocationAsBoundary(doc, { node: pA, offset: 0 }),
          end: serializeLocationAsBoundary(doc, { node: pB, offset: 0 }),
        },
        {
          start: serializeLocationAsBoundary(doc, { node: pB, offset: 0 }),
          end: serializeLocationAsBoundary(doc, { node: pC, offset: 0 }),
        },
        {
          start: serializeLocationAsBoundary(doc, { node: pC, offset: 0 }),
          end: createRootEndBoundary(doc),
        },
      ]

      // Anchor at start of page 2
      const anchor = serializeLocationAsBoundary(doc, { node: pB.firstChild as Text, offset: 2 })
      expect(findPageIndexForReadingAnchor(doc, pages, anchor)).toBe(1)

      // Anchor at start of page 1
      const anchor0 = serializeLocationAsBoundary(doc, { node: pA.firstChild as Text, offset: 1 })
      expect(findPageIndexForReadingAnchor(doc, pages, anchor0)).toBe(0)
    })
  })
})

describe("epubBookAnchor", () => {
  describe("readingBoundaryFromRootUtf16Offset", () => {
    it("finds offset 0 at start", () => {
      const doc = document.createElement("div")
      doc.innerHTML = "<p>hello</p><p>world</p>"
      const boundary = readingBoundaryFromRootUtf16Offset(doc, 0)
      expect(boundary.isText).toBe(true)
      expect(boundary.offset).toBe(0)
    })

    it("finds offset across multiple text nodes", () => {
      const doc = document.createElement("div")
      doc.innerHTML = "<p>hello</p><p>world</p>"
      // "hello" = 5 chars, so offset 7 lands in "world" at index 2
      const boundary = readingBoundaryFromRootUtf16Offset(doc, 7)
      expect(boundary.isText).toBe(true)
      expect(boundary.offset).toBe(2)
    })

    it("clamps past end to root end boundary", () => {
      const doc = document.createElement("div")
      doc.innerHTML = "<p>hi</p>"
      const boundary = readingBoundaryFromRootUtf16Offset(doc, 999)
      // Past-end falls back to collapsed range at root end
      expect(boundary.isText).toBe(false)
      expect(boundary.offset).toBe(doc.childNodes.length)
    })
  })

  describe("clampChapterCharOffset", () => {
    it("clamps negative to 0", () => {
      const ch = makeChapter("<p>hello</p>")
      expect(clampChapterCharOffset(ch, -5)).toBe(0)
    })

    it("clamps past end", () => {
      const ch = makeChapter("<p>hi</p>")
      expect(clampChapterCharOffset(ch, 999)).toBeLessThan(999)
    })

    it("passes through valid offset", () => {
      const ch = makeChapter("<p>hello</p>")
      expect(clampChapterCharOffset(ch, 3)).toBe(3)
    })
  })

  describe("epubReadingBoundaryFromChapterCharOffset", () => {
    it("returns root boundary for empty body", () => {
      const ch = makeChapter("")
      const result = epubReadingBoundaryFromChapterCharOffset(ch, 0)
      expect(result).not.toBeNull()
      expect(result!.path).toEqual([])
      expect(result!.offset).toBe(0)
    })

    it("resolves offset in simple body", () => {
      const ch = makeChapter("<p>hello world</p>")
      const boundary = epubReadingBoundaryFromChapterCharOffset(ch, 6)
      expect(boundary).not.toBeNull()
      expect(boundary!.isText).toBe(true)
      expect(boundary!.offset).toBe(6)
    })
  })

  describe("buildTextChapterBookAnchorAtBoundary", () => {
    it("builds anchor with correct charOffset", () => {
      const ch = makeChapter("<p>hello world</p>")
      const boundary: RangeBoundary = { path: [0, 0], offset: 6, isText: true }
      const anchor = buildTextChapterBookAnchorAtBoundary({ chapter: ch, boundary })
      expect(anchor.chapterIndex).toBe(0)
      expect(anchor.charOffset).toBe(6)
      expect(anchor.textSnippet).toBeDefined()
    })

    it("handles boundary at root start", () => {
      const ch = makeChapter("<p>abc</p>")
      const boundary: RangeBoundary = { path: [], offset: 0, isText: false }
      const anchor = buildTextChapterBookAnchorAtBoundary({ chapter: ch, boundary })
      expect(anchor.charOffset).toBe(0)
    })
  })
})
