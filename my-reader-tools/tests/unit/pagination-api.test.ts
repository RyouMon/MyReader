import { describe, expect, it } from "vitest"
import { BookReader } from "my-reader-tools/reader-core"
import { ProgressivePaginator } from "my-reader-tools/pagination"

describe("BookReader.peekPageIndices", () => {
  it("returns empty when not on a ProgressivePaginator", () => {
    const reader = new BookReader()
    expect(reader.peekPageIndices(0, 1)).toEqual([])
  })

  it("returns neighbors around centerIndex within radius", () => {
    const reader = new BookReader()
    const paginator = new ProgressivePaginator()
    ;(reader as any).paginator = paginator
    ;(reader as any)._book = { layoutMode: "reflowable" }
    paginator.layout(
      {
        chapter: { type: "text", index: 0 } as any,
        pages: [
          { start: { path: [], offset: 0, isText: false }, end: { path: [0], offset: 1, isText: false } },
          { start: { path: [0], offset: 1, isText: false }, end: { path: [0], offset: 2, isText: false } },
          { start: { path: [0], offset: 2, isText: false }, end: { path: [0], offset: 3, isText: false } },
          { start: { path: [0], offset: 3, isText: false }, end: { path: [0], offset: 4, isText: false } },
          { start: { path: [0], offset: 4, isText: false }, end: { path: [0], offset: 5, isText: false } },
        ],
      },
      { fontFamily: "", fontSize: 16, viewPortHeight: 600, viewPortWidth: 400, paddingX: 1, lineHeight: 1.5 },
    )

    expect(reader.peekPageIndices(2, 1)).toEqual([1, 2, 3])
    expect(reader.peekPageIndices(0, 1)).toEqual([0, 1])
    expect(reader.peekPageIndices(4, 1)).toEqual([3, 4])
    expect(reader.peekPageIndices(2, 2)).toEqual([0, 1, 2, 3, 4])
  })
})

describe("BookReader.renderPageInto", () => {
  it("returns false when reader is not initialized", () => {
    const reader = new BookReader()
    const div = document.createElement("div")
    expect(reader.renderPageInto(div, 0)).toBe(false)
    expect(div.childNodes.length).toBe(0)
  })

  it("returns false for out-of-bounds indices", () => {
    const reader = new BookReader()
    const paginator = new ProgressivePaginator()
    ;(reader as any).paginator = paginator
    ;(reader as any)._book = { layoutMode: "reflowable" }
    ;(reader as any)._lastTextLayout = {
      sourceRoot: document.createElement("div"),
      chapter: { type: "text", index: 0, bodyHtml: "<p>hello</p>" },
    }
    paginator.layout(
      {
        chapter: { type: "text", index: 0 } as any,
        pages: [
          { start: { path: [], offset: 0, isText: false }, end: { path: [0], offset: 1, isText: false } },
        ],
      },
      { fontFamily: "", fontSize: 16, viewPortHeight: 600, viewPortWidth: 400, paddingX: 1, lineHeight: 1.5 },
    )

    const div = document.createElement("div")
    expect(reader.renderPageInto(div, -1)).toBe(false)
    expect(reader.renderPageInto(div, 999)).toBe(false)
    expect(div.childNodes.length).toBe(0)
  })

  it("returns true for valid page index", () => {
    const reader = new BookReader()
    const paginator = new ProgressivePaginator()
    ;(reader as any).paginator = paginator
    ;(reader as any)._book = { layoutMode: "reflowable" }

    const sourceRoot = document.createElement("div")
    sourceRoot.innerHTML = "<p>page one</p><p>page two</p>"
    ;(reader as any)._lastTextLayout = {
      sourceRoot,
      chapter: { type: "text", index: 0, bodyHtml: "<p>page one</p><p>page two</p>" },
    }
    paginator.layout(
      {
        chapter: { type: "text", index: 0 } as any,
        pages: [
          {
            start: { path: [], offset: 0, isText: false },
            end: { path: [0], offset: 1, isText: false },
          },
          {
            start: { path: [0], offset: 1, isText: false },
            end: { path: [0], offset: 2, isText: false },
          },
        ],
      },
      { fontFamily: "", fontSize: 16, viewPortHeight: 600, viewPortWidth: 400, paddingX: 1, lineHeight: 1.5 },
    )

    const div = document.createElement("div")
    expect(reader.renderPageInto(div, 0)).toBe(true)
    expect(reader.renderPageInto(div, 1)).toBe(true)
  })
})

describe("BookReader.applyAnchorRecenter", () => {
  it("sets pending recenter anchor", () => {
    const reader = new BookReader()
    reader.applyAnchorRecenter({ chapterIndex: 2, charOffset: 150 })
    expect((reader as any)._pendingRecenterAnchor).toEqual({
      chapterIndex: 2,
      charOffset: 150,
    })
  })
})
