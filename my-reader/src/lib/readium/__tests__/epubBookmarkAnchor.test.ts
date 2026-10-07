import type { EpubNavigator } from "@readium/navigator"
import { Locator, LocatorLocations, LocatorText } from "@readium/shared"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  captureEpubViewportStartLocator,
  captureReaderBookmarkAnchor,
  isReaderBookmarkAnchorVisible,
  readerViewportAnchorOffset,
  restoreReaderViewportAnchorOffset,
  waitForEpubViewportLayout,
} from "../epubBookmarkAnchor"
import {
  epubTtsPlaybackPlanAtLocator,
  extractEpubTtsUtterances,
} from "../epubTts"

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
  it("keeps cross-element context for the first visible character", () => {
    document.body.innerHTML =
      '<p id="target"><span>重复</span>之后的上下文可以唯一定位当前页。</p>'
    const node = document.querySelector("span")?.firstChild
    expect(node).toBeInstanceOf(Text)
    const range = document.createRange()
    range.setStart(node!, 0)
    range.collapse(true)
    Object.defineProperty(document, "caretRangeFromPoint", {
      configurable: true,
      value: () => range,
    })
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [rect(10, 10)] as unknown as DOMRectList,
    })

    const locator = captureEpubViewportStartLocator(navigatorFor(window), {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.5 },
    })

    expect(locator?.text).toEqual({
      highlight: "重",
      after: "复之后的上下文可以唯一定位当前页。",
    })
  })

  it("starts narration at an indented sentence fragment above the next sentence", () => {
    const text =
      "Previous-page prefix continues here. Second sentence must wait."
    document.body.innerHTML = `<p id="target">${text}</p>`
    const node = document.querySelector("#target")?.firstChild
    expect(node).toBeInstanceOf(Text)
    const fragmentOffset = text.indexOf("continues")
    const secondOffset = text.indexOf("Second")
    const rangeAt = (offset: number) => {
      const range = document.createRange()
      range.setStart(node!, offset)
      range.collapse(true)
      return range
    }
    Object.defineProperty(document, "caretRangeFromPoint", {
      configurable: true,
      value: (_x: number, y: number) =>
        rangeAt(y < 30 ? fragmentOffset : secondOffset),
    })
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: document.documentElement,
    })
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 200,
    })
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 100,
    })
    Object.defineProperty(document.documentElement, "scrollWidth", {
      configurable: true,
      value: 400,
    })
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 100,
    })
    const getComputedStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      const style = getComputedStyle(element)
      if (element !== document.documentElement) return style
      return new Proxy(style, {
        get: (target, property) =>
          property === "columnCount"
            ? "1"
            : Reflect.get(target, property, target),
      })
    })
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value(this: Range) {
        if (this.startOffset === 0 && this.endOffset === text.length) {
          return [rect(-100, 5), rect(30, 5), rect(10, 40)]
        }
        if (this.startOffset < fragmentOffset) return [rect(-100, 5)]
        if (this.startOffset < secondOffset) return [rect(30, 5)]
        return [rect(10, 40)]
      },
    })
    const currentLocator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.4 },
    }

    const viewportStart = captureEpubViewportStartLocator(
      navigatorFor(window),
      currentLocator,
    )
    const utterances = extractEpubTtsUtterances(
      [
        {
          href: "chapter.xhtml",
          type: "application/xhtml+xml",
          html: `<html lang="en"><body><p>${text}</p></body></html>`,
        },
      ],
      [],
      { fallbackLanguage: "en" },
    )
    const plan = viewportStart
      ? epubTtsPlaybackPlanAtLocator(
          utterances,
          new Locator({
            href: viewportStart.href,
            type: viewportStart.type,
            locations: new LocatorLocations({
              progression: viewportStart.locations?.progression,
              otherLocations: new Map(
                Object.entries(viewportStart.locations ?? {}).filter(
                  ([key]) => key === "cssSelector" || key === "domRange",
                ),
              ),
            }),
            text: viewportStart.text
              ? new LocatorText(viewportStart.text)
              : undefined,
          }),
        )
      : null

    expect(viewportStart?.text?.highlight).toBe("c")
    expect(plan?.utterances[plan.index]?.plain).toBe("continues here.")
  })

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
