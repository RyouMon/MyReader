import { describe, expect, it, vi } from "vitest"
import { createReaderViewportAnchorRuntime } from "../src/reader-viewport-anchor"

function rect(left: number, top: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + 10,
    bottom: top + 20,
    width: 10,
    height: 20,
    toJSON: () => ({}),
  }
}

function overrideProperty(
  target: object,
  property: PropertyKey,
  value: unknown,
): () => void {
  const original = Object.getOwnPropertyDescriptor(target, property)
  Object.defineProperty(target, property, {
    configurable: true,
    value,
  })
  return () => {
    if (original) {
      Object.defineProperty(target, property, original)
    } else {
      Reflect.deleteProperty(target, property)
    }
  }
}

describe("reader viewport anchors", () => {
  it("should bind native bridge methods when called without a window argument", () => {
    document.body.innerHTML = "<section><p>Mobile bookmark anchor</p></section>"
    const text = document.querySelector("p")?.firstChild
    expect(text).toBeInstanceOf(Text)

    const caretRange = document.createRange()
    caretRange.setStart(text!, 3)
    caretRange.collapse(true)
    const renderedRect = rect(window.innerWidth / 2, window.innerHeight / 2)
    const rects = [renderedRect] as unknown as DOMRectList
    const scrollBy = vi.fn()

    const restore = [
      overrideProperty(document, "caretRangeFromPoint", () => caretRange),
      overrideProperty(Range.prototype, "getClientRects", () => rects),
      overrideProperty(window, "scrollBy", scrollBy),
    ]

    try {
      const runtime = createReaderViewportAnchorRuntime(window)
      const capture = runtime.captureReaderViewportAnchor()
      expect(capture).not.toBeNull()
      expect(runtime.isReaderViewportAnchorVisible(capture!.domRange)).toBe(
        true,
      )
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
    } finally {
      restore.reverse().forEach((restoreProperty) => restoreProperty())
      document.body.replaceChildren()
    }
  })
})
