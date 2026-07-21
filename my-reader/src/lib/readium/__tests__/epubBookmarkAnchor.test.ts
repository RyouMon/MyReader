import type { EpubNavigator } from "@readium/navigator"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  captureReaderBookmarkAnchor,
  isReaderBookmarkAnchorVisible,
  readerViewportAnchorOffset,
  restoreReaderViewportAnchorOffset,
  waitForEpubViewportLayout,
} from "../epubBookmarkAnchor"

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

afterEach(() => {
  document.body.replaceChildren()
  Reflect.deleteProperty(document, "caretRangeFromPoint")
  Reflect.deleteProperty(Range.prototype, "getClientRects")
  vi.restoreAllMocks()
})

function navigatorFor(window: Window): EpubNavigator {
  return {
    _cframes: [{ iframe: { contentWindow: window } }],
  } as unknown as EpubNavigator
}

describe("EPUB bookmark content anchors", () => {
  it("should capture the text nearest the center as a collapsed DOM range", () => {
    document.body.innerHTML =
      '<section><p id="target">开头文字中心内容结尾</p></section>'
    const node = document.querySelector("#target")?.firstChild
    expect(node).toBeInstanceOf(Text)
    const range = document.createRange()
    range.setStart(node!, 4)
    range.collapse(true)
    Object.defineProperty(document, "caretRangeFromPoint", {
      configurable: true,
      value: () => range,
    })
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () =>
        [
          rect(window.innerWidth / 2, window.innerHeight / 2),
        ] as unknown as DOMRectList,
    })

    expect(captureReaderBookmarkAnchor(window)).toEqual({
      cssSelector: "#target",
      domRange: {
        start: {
          cssSelector: "#target",
          textNodeIndex: 0,
          charOffset: 4,
        },
      },
      text: {
        before: "开头文字",
        highlight: "中",
        after: "心内容结尾",
      },
    })
  })

  it("should keep the same content anchor active after its layout moves", () => {
    document.body.innerHTML = '<p id="target">字号变化后仍命中</p>'
    let renderedRect = rect(40, 120)
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [renderedRect] as unknown as DOMRectList,
    })
    const locator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        progression: 0.2,
        domRange: {
          start: {
            cssSelector: "#target",
            textNodeIndex: 0,
            charOffset: 3,
          },
        },
      },
    }

    expect(isReaderBookmarkAnchorVisible(window, locator)).toBe(true)

    renderedRect = rect(window.innerWidth + 40, 120)
    expect(isReaderBookmarkAnchorVisible(window, locator)).toBe(false)
  })

  it("should restore the anchor to its previous vertical viewport offset", () => {
    document.body.innerHTML = '<p id="target">字号变化后仍命中</p>'
    let renderedRect = rect(40, 120)
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [renderedRect] as unknown as DOMRectList,
    })
    const scrollBy = vi.fn()
    Object.defineProperty(window, "scrollBy", {
      configurable: true,
      value: scrollBy,
    })
    const navigator = navigatorFor(window)
    const locator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        progression: 0.2,
        domRange: {
          start: {
            cssSelector: "#target",
            textNodeIndex: 0,
            charOffset: 3,
          },
        },
      },
    }
    const offset = readerViewportAnchorOffset(navigator, locator)
    expect(offset).not.toBeNull()

    renderedRect = rect(40, 260)
    expect(restoreReaderViewportAnchorOffset(navigator, locator, offset!)).toBe(
      true,
    )
    expect(scrollBy).toHaveBeenCalledWith(0, 140)
  })

  it("should stop waiting for layout when a newer transaction replaces it", async () => {
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0)
        return 1
      },
    })

    await expect(
      waitForEpubViewportLayout(navigatorFor(window), () => false),
    ).resolves.toBe(false)
  })
})
