import { afterEach, describe, expect, it, vi } from "vitest"
import {
  captureReaderViewportAnchor,
  createReaderViewportAnchorRuntime,
  isReaderViewportAnchorVisible,
  readerViewportAnchorOffset,
  readerViewportLayoutState,
  restoreReaderViewportAnchorOffset,
  sameReaderViewportLayout,
} from "../src/reader-viewport-anchor"
import type {
  ReaderViewportDomRange,
  ReaderViewportLayoutState,
} from "../src/reader-viewport-anchor"

const restoreProperties: Array<() => void> = []

function rect(left: number, top: number, width = 10, height = 20): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  }
}

function overrideDescriptor(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor,
): () => void {
  const original = Object.getOwnPropertyDescriptor(target, property)
  let restored = false
  Object.defineProperty(target, property, {
    configurable: true,
    ...descriptor,
  })
  const restore = () => {
    if (restored) return
    restored = true
    if (original) {
      Object.defineProperty(target, property, original)
    } else {
      Reflect.deleteProperty(target, property)
    }
  }
  restoreProperties.push(restore)
  return restore
}

function overrideProperty(
  target: object,
  property: PropertyKey,
  value: unknown,
): () => void {
  return overrideDescriptor(target, property, { value })
}

function rangeAt(node: Node, offset: number): Range {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  return range
}

function useRangeRects(
  source: DOMRect[] | ((range: Range) => DOMRect[]),
  bounding: DOMRect | null = rect(0, 0),
): void {
  overrideProperty(
    Range.prototype,
    "getClientRects",
    function getClientRects(this: Range): DOMRectList {
      const value = typeof source === "function" ? source(this) : source
      return value as unknown as DOMRectList
    },
  )
  overrideProperty(
    Range.prototype,
    "getBoundingClientRect",
    function getBoundingClientRect(): DOMRect {
      return bounding as DOMRect
    },
  )
}

function domRange(
  cssSelector: string,
  textNodeIndex = 0,
  charOffset?: number,
): ReaderViewportDomRange {
  return {
    start: {
      cssSelector,
      textNodeIndex,
      ...(charOffset === undefined ? {} : { charOffset }),
    },
  }
}

function useViewport(width: number, height: number): void {
  overrideProperty(window, "innerWidth", width)
  overrideProperty(window, "innerHeight", height)
}

afterEach(() => {
  restoreProperties.reverse().forEach((restore) => restore())
  restoreProperties.length = 0
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("reader viewport anchor capture", () => {
  it("should bind native bridge methods when called without a window argument", () => {
    document.body.innerHTML = "<section><p>Mobile bookmark anchor</p></section>"
    const text = document.querySelector("p")?.firstChild
    expect(text).toBeInstanceOf(Text)

    overrideProperty(document, "caretRangeFromPoint", () => rangeAt(text!, 3))
    useRangeRects([rect(window.innerWidth / 2, window.innerHeight / 2)])
    const scrollBy = vi.fn()
    overrideProperty(window, "scrollBy", scrollBy)

    const runtime = createReaderViewportAnchorRuntime(window)
    const capture = runtime.captureReaderViewportAnchor()

    expect(capture).not.toBeNull()
    expect(runtime.isReaderViewportAnchorVisible(capture!.domRange)).toBe(true)
    expect(runtime.readerViewportLayoutState()).toMatchObject({
      clientHeight: expect.any(Number),
      clientWidth: expect.any(Number),
    })
    expect(
      runtime.restoreReaderViewportAnchorOffset(
        capture!.domRange,
        capture!.yRatio,
      ),
    ).toBe(true)
    expect(scrollBy).toHaveBeenCalledOnce()
  })

  it("should use caret positions and CSS escaping when the element has a unique ID", () => {
    document.body.innerHTML = '<p id="anchor">Anchor text</p>'
    const text = document.querySelector("p")!.firstChild as Text
    const escape = vi.fn((value: string) => value)
    overrideProperty(window, "CSS", { escape })
    overrideProperty(document, "caretPositionFromPoint", () => ({
      offsetNode: text,
      offset: 0,
    }))
    useRangeRects([], rect(40, 40))

    const capture = captureReaderViewportAnchor(window)

    expect(capture).toMatchObject({
      cssSelector: "#anchor",
      text: { highlight: "A", after: "nchor text" },
    })
    expect(capture?.text.before).toBeUndefined()
    expect(escape).toHaveBeenCalledWith("anchor")
  })

  it("should build a stable path when IDs are duplicated and the caret targets an element", () => {
    document.body.innerHTML = `
      <main id="root:id">
        <p id="duplicate:id">First anchor</p>
        <p id="duplicate:id">A long anchor text that is longer than thirty-two characters.</p>
      </main>
    `
    const target = document.querySelectorAll("p")[1]
    overrideProperty(window, "CSS", undefined)
    overrideProperty(document, "caretPositionFromPoint", () => ({
      offsetNode: target,
      offset: 99,
    }))
    useRangeRects([rect(40, 40)])

    const capture = captureReaderViewportAnchor(window)

    expect(capture).toMatchObject({
      cssSelector: "#root\\3a id > p:nth-of-type(2)",
      text: { highlight: "." },
    })
    expect(capture?.text.before).toHaveLength(32)
    expect(capture?.text.after).toBeUndefined()
  })

  it("should choose the closest glyph when sampled caret ranges differ", () => {
    document.body.innerHTML = `
      <p id="blank">   </p>
      <p id="far">Far candidate</p>
      <p id="near">Near candidate</p>
    `
    useViewport(100, 100)
    const blank = document.querySelector("#blank")!
    const far = document.querySelector("#far")!
    const near = document.querySelector("#near")!
    const samples: Array<Range | null> = [
      null,
      rangeAt(blank.firstChild!, 0),
      rangeAt(far, 0),
      rangeAt(near, near.childNodes.length),
      rangeAt(far.firstChild!, 1),
    ]
    let sampleIndex = 0
    overrideProperty(
      document,
      "caretRangeFromPoint",
      () => samples[sampleIndex++] ?? null,
    )
    useRangeRects((range) => {
      if (range.startContainer === near.firstChild) return [rect(45, 40)]
      return [rect(80, 80)]
    })

    expect(captureReaderViewportAnchor(window)?.cssSelector).toBe("#near")
  })

  it("should fall back to a caret range when a caret position has no text", () => {
    document.body.innerHTML =
      '<div id="empty"></div><p id="anchor">Fallback</p>'
    const empty = document.querySelector("#empty")!
    const text = document.querySelector("#anchor")!.firstChild!
    overrideProperty(document, "caretPositionFromPoint", () => ({
      offsetNode: empty,
      offset: 0,
    }))
    overrideProperty(document, "caretRangeFromPoint", () => rangeAt(text, 0))
    useRangeRects([rect(40, 40)])

    expect(captureReaderViewportAnchor(window)?.cssSelector).toBe("#anchor")
  })

  it("should return null when no caret API resolves visible text", () => {
    overrideProperty(document, "caretPositionFromPoint", undefined)
    overrideProperty(document, "caretRangeFromPoint", undefined)

    expect(captureReaderViewportAnchor(window)).toBeNull()
  })

  it("should return null when a caret range contains no text", () => {
    document.body.innerHTML = '<div id="empty"></div>'
    const empty = document.querySelector("#empty")!
    overrideProperty(document, "caretRangeFromPoint", () => rangeAt(empty, 0))

    expect(captureReaderViewportAnchor(window)).toBeNull()
  })

  it("should return null when the resolved text is detached", () => {
    const text = document.createTextNode("Detached text")
    overrideProperty(document, "caretPositionFromPoint", () => ({
      offsetNode: text,
      offset: 0,
    }))
    useRangeRects([rect(40, 40)])

    expect(captureReaderViewportAnchor(window)).toBeNull()
  })

  it("should return null when the resolved text leaves its parent child list", () => {
    document.body.innerHTML = '<p id="anchor">Transient text</p>'
    const parent = document.querySelector("#anchor")!
    const text = parent.firstChild!
    overrideProperty(document, "caretPositionFromPoint", () => ({
      offsetNode: text,
      offset: 0,
    }))
    overrideProperty(parent, "childNodes", [])
    useRangeRects([rect(40, 40)])

    expect(captureReaderViewportAnchor(window)).toBeNull()
  })

  it("should ignore a point when its text becomes blank during layout", () => {
    document.body.innerHTML = '<p id="anchor">Changing text</p>'
    const text = document.querySelector("#anchor")!.firstChild as Text
    let reads = 0
    overrideDescriptor(text, "data", {
      get: () => (reads++ === 0 ? "Changing text" : "   "),
    })
    overrideProperty(document, "caretPositionFromPoint", () => ({
      offsetNode: text,
      offset: 0,
    }))
    useRangeRects([rect(40, 40)])

    expect(captureReaderViewportAnchor(window)).toBeNull()
  })

  it("should ignore a point when no client or bounding rectangle exists", () => {
    document.body.innerHTML = '<p id="anchor">Unrendered text</p>'
    const text = document.querySelector("#anchor")!.firstChild!
    overrideProperty(document, "caretPositionFromPoint", () => ({
      offsetNode: text,
      offset: 0,
    }))
    useRangeRects([], null)

    expect(captureReaderViewportAnchor(window)).toBeNull()
  })
})

describe("reader viewport DOM ranges", () => {
  it("should return false when a persisted DOM range cannot resolve text", () => {
    document.body.innerHTML =
      '<p id="nested"><span>Nested</span></p><p id="empty"></p>'
    document.querySelector("#empty")!.append(document.createTextNode(""))

    expect(isReaderViewportAnchorVisible(window, domRange("#missing"))).toBe(
      false,
    )
    expect(isReaderViewportAnchorVisible(window, domRange("#nested"))).toBe(
      false,
    )
    expect(isReaderViewportAnchorVisible(window, domRange("#empty"))).toBe(
      false,
    )
  })

  it("should check every viewport edge when deciding anchor visibility", () => {
    document.body.innerHTML = '<p id="anchor">Visible anchor</p>'
    useViewport(100, 100)
    useRangeRects([
      rect(-10, 10),
      rect(10, -20),
      rect(100, 10),
      rect(10, 100),
      rect(10, 10),
    ])

    expect(isReaderViewportAnchorVisible(window, domRange("#anchor"))).toBe(
      true,
    )
  })

  it("should clamp whitespace and surrogate offsets when resolving an anchor", () => {
    document.body.innerHTML = `
      <p id="after">  B</p>
      <p id="before">A  </p>
      <p id="spaces">   </p>
      <p id="surrogate">A😀B</p>
      <p id="private"></p>
    `
    const loneLow = document.createElement("p")
    loneLow.id = "lone-low"
    loneLow.append(document.createTextNode("\udc00x"))
    document.body.append(loneLow)
    const offsets: number[] = []
    useRangeRects((range) => {
      offsets.push(range.startOffset)
      return [rect(10, 10)]
    })

    expect(
      isReaderViewportAnchorVisible(window, domRange("#after", 0, 1)),
    ).toBe(true)
    expect(
      isReaderViewportAnchorVisible(window, domRange("#before", 0, 2)),
    ).toBe(true)
    expect(
      isReaderViewportAnchorVisible(window, domRange("#spaces", 0, 1)),
    ).toBe(true)
    expect(
      isReaderViewportAnchorVisible(window, domRange("#surrogate", 0, 2)),
    ).toBe(true)
    expect(
      isReaderViewportAnchorVisible(window, domRange("#lone-low", 0, 0)),
    ).toBe(true)
    expect(
      isReaderViewportAnchorVisible(window, domRange("#private", 0, 0)),
    ).toBe(true)

    expect(offsets).toEqual([2, 0, 1, 1, 0, 0])
  })

  it("should use the first character when a persisted offset is omitted", () => {
    document.body.innerHTML = '<p id="anchor">Anchor</p>'
    const offsets: number[] = []
    useRangeRects((range) => {
      offsets.push(range.startOffset)
      return [rect(10, 10)]
    })

    expect(isReaderViewportAnchorVisible(window, domRange("#anchor"))).toBe(
      true,
    )
    expect(
      isReaderViewportAnchorVisible(window, domRange("#anchor", 0, 999)),
    ).toBe(true)
    expect(offsets).toEqual([0, 5])
  })
})

describe("reader viewport anchor positioning", () => {
  it("should calculate a normalized offset when the anchor has a rectangle", () => {
    document.body.innerHTML = '<p id="anchor">Anchor</p>'
    useViewport(100, 200)
    useRangeRects([rect(20, 30, 10, 20)])

    expect(readerViewportAnchorOffset(window, domRange("#anchor"))).toEqual({
      xRatio: 0.25,
      yRatio: 0.2,
    })
  })

  it("should return null when the anchor has no rectangle", () => {
    document.body.innerHTML = '<p id="anchor">Anchor</p>'
    useRangeRects([])

    expect(readerViewportAnchorOffset(window, domRange("#anchor"))).toBeNull()
  })

  it.each([
    [0, 100],
    [100, 0],
  ])("should return null when the viewport is %d by %d", (width, height) => {
    document.body.innerHTML = '<p id="anchor">Anchor</p>'
    useViewport(width, height)
    useRangeRects([rect(10, 10)])

    expect(readerViewportAnchorOffset(window, domRange("#anchor"))).toBeNull()
  })

  it("should restore the vertical offset when the anchor has a rectangle", () => {
    document.body.innerHTML = '<p id="anchor">Anchor</p>'
    useViewport(100, 200)
    useRangeRects([rect(20, 60, 10, 20)])
    const scrollBy = vi.fn()
    overrideProperty(window, "scrollBy", scrollBy)

    expect(
      restoreReaderViewportAnchorOffset(window, domRange("#anchor"), 0.25),
    ).toBe(true)
    expect(scrollBy).toHaveBeenCalledWith(0, 20)
  })

  it("should return false when restoring an anchor without a rectangle", () => {
    document.body.innerHTML = '<p id="anchor">Anchor</p>'
    useRangeRects([])

    expect(
      restoreReaderViewportAnchorOffset(window, domRange("#anchor"), 0.5),
    ).toBe(false)
  })
})

describe("reader viewport layout", () => {
  it("should use viewport fallbacks when document metrics are unavailable", () => {
    useViewport(320, 480)
    overrideProperty(document, "fonts", undefined)
    overrideProperty(document, "scrollingElement", null)

    expect(readerViewportLayoutState(window)).toEqual({
      fontsLoaded: true,
      clientHeight: 480,
      clientWidth: 320,
      scrollHeight: 0,
      scrollWidth: 0,
    })
  })

  it("should use document metrics when fonts and layout are settled", () => {
    const scrollingElement = document.createElement("div")
    overrideProperty(scrollingElement, "clientHeight", 480)
    overrideProperty(scrollingElement, "clientWidth", 320)
    overrideProperty(scrollingElement, "scrollHeight", 960)
    overrideProperty(scrollingElement, "scrollWidth", 640)
    overrideProperty(document, "fonts", { status: "loaded" })
    overrideProperty(document, "scrollingElement", scrollingElement)

    expect(readerViewportLayoutState(window)).toEqual({
      fontsLoaded: true,
      clientHeight: 480,
      clientWidth: 320,
      scrollHeight: 960,
      scrollWidth: 640,
    })
  })

  it("should report unsettled layout when document fonts are loading", () => {
    overrideProperty(document, "fonts", { status: "loading" })

    expect(readerViewportLayoutState(window).fontsLoaded).toBe(false)
  })

  it("should compare every layout dimension when detecting stability", () => {
    const layout: ReaderViewportLayoutState = {
      fontsLoaded: true,
      clientHeight: 480,
      clientWidth: 320,
      scrollHeight: 960,
      scrollWidth: 640,
    }

    expect(sameReaderViewportLayout(null, layout)).toBe(false)
    expect(
      sameReaderViewportLayout({ ...layout, clientHeight: 481 }, layout),
    ).toBe(false)
    expect(
      sameReaderViewportLayout({ ...layout, clientWidth: 321 }, layout),
    ).toBe(false)
    expect(
      sameReaderViewportLayout({ ...layout, scrollHeight: 961 }, layout),
    ).toBe(false)
    expect(
      sameReaderViewportLayout({ ...layout, scrollWidth: 641 }, layout),
    ).toBe(false)
    expect(sameReaderViewportLayout(layout, layout)).toBe(true)
  })
})
