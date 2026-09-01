import { Locator, LocatorLocations, LocatorText } from "@readium/shared"
import { describe, expect, it, vi } from "vitest"
import {
  connectEpubTtsPointReadBridge,
  epubTtsUtteranceIndexAtLocator,
  epubTtsUtteranceAtPoint,
  extractEpubTtsUtterances,
  setEpubTtsPointReadEnabled,
} from "@/lib/readium/epubTts"

describe("EPUB TTS extraction", () => {
  it("uses Readium extraction while producing sentence-level locators", () => {
    const utterances = extractEpubTtsUtterances(
      [
        {
          href: "OPS/chapter.xhtml",
          type: "application/xhtml+xml",
          title: "Chapter",
          html: `
            <html lang="zh-CN"><body>
              <p id="opening">第一句。第二句！</p>
              <p lang="en">Third sentence. Next sentence?</p>
            </body></html>
          `,
        },
      ],
      [
        {
          href: "chapter.xhtml",
          type: "application/xhtml+xml",
          locations: { progression: 0, position: 1, totalProgression: 0 },
        },
      ],
    )

    expect(utterances.map((utterance) => utterance.plain)).toEqual([
      "第一句。",
      "第二句！",
      "Third sentence.",
      "Next sentence?",
    ])
    expect(utterances[0]?.language).toBe("zh-CN")
    expect(utterances[2]?.language).toBe("en")
    expect(utterances[0]?.locator.text?.highlight).toBe("第一句。")
    expect(
      utterances[0]?.locator.locations.otherLocations?.get("cssSelector"),
    ).toBe("body > p:nth-of-type(1)")
    expect(utterances[0]?.locator.locations.fragments).toEqual(["opening"])
    expect(utterances[0]?.locator.locations.position).toBe(1)
    expect(utterances[1]?.locator.locations.progression).toBeGreaterThan(
      utterances[0]?.locator.locations.progression ?? 0,
    )
  })

  it("finds the sentence containing a selected text locator", () => {
    const utterances = extractEpubTtsUtterances(
      [
        {
          href: "chapter.xhtml",
          type: "application/xhtml+xml",
          html: "<html><body><p>One sentence. Another sentence.</p></body></html>",
        },
      ],
      [],
      { fallbackLanguage: "en" },
    )
    const selection = new Locator({
      href: "OPS/chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0 }),
      text: new LocatorText({ highlight: "Another" }),
    })

    expect(epubTtsUtteranceIndexAtLocator(utterances, selection)).toBe(1)
  })

  it("uses viewport context instead of matching a common single glyph", () => {
    const utterances = extractEpubTtsUtterances(
      [
        {
          href: "chapter.xhtml",
          type: "application/xhtml+xml",
          html: "<html><body><p>Common first sentence. Common target sentence.</p></body></html>",
        },
      ],
      [],
      { fallbackLanguage: "en" },
    )
    const viewportStart = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0 }),
      text: new LocatorText({
        before: "first sentence. ",
        highlight: "C",
        after: "ommon target sentence.",
      }),
    })

    expect(epubTtsUtteranceIndexAtLocator(utterances, viewportStart)).toBe(1)
  })

  it("does not fall back to the first sentence for an unmatched resource", () => {
    const utterances = extractEpubTtsUtterances(
      [
        {
          href: "chapter-1.xhtml",
          type: "application/xhtml+xml",
          html: "<html><body><p>The opening sentence.</p></body></html>",
        },
      ],
      [],
      { fallbackLanguage: "en" },
    )
    const transientLocator = new Locator({
      href: "chapter-loading.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0 }),
    })

    expect(epubTtsUtteranceIndexAtLocator(utterances, transientLocator)).toBe(
      -1,
    )
  })

  it("resolves a clicked glyph to its sentence locator", () => {
    const html =
      '<html><body><p id="line">First sentence. Second sentence.</p></body></html>'
    const utterances = extractEpubTtsUtterances(
      [{ href: "chapter.xhtml", type: "application/xhtml+xml", html }],
      [],
      { fallbackLanguage: "en" },
    )
    const document = new DOMParser().parseFromString(html, "text/html")
    const getClientRects = vi.fn(function (this: Range) {
      const left = this.toString().startsWith("Second") ? 120 : 0
      return [
        {
          left,
          right: left + 100,
          top: 0,
          bottom: 30,
        } as DOMRect,
      ] as unknown as DOMRectList
    })
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: getClientRects,
    })

    expect(
      epubTtsUtteranceAtPoint(utterances, "OPS/chapter.xhtml", document, {
        x: 150,
        y: 15,
      })?.plain,
    ).toBe("Second sentence.")

    Reflect.deleteProperty(Range.prototype, "getClientRects")
  })

  it("marks readable text blocks without making their empty space clickable", () => {
    const document = new DOMParser().parseFromString(
      "<html><body><section><p>Readable paragraph.</p></section><div>Decoration</div></body></html>",
      "text/html",
    )
    const paragraph = document.querySelector("p")
    const section = document.querySelector("section")

    setEpubTtsPointReadEnabled(document, true)

    expect(paragraph?.hasAttribute("data-myreader-tts-point-read")).toBe(true)
    expect(section?.hasAttribute("data-myreader-tts-point-read")).toBe(false)
    expect(
      document.getElementById("myreader-tts-point-read-style")?.textContent,
    ).toContain("data-myreader-tts-point-read-hover")
    expect(
      document.getElementById("myreader-tts-point-read-style")?.textContent,
    ).not.toContain("[data-myreader-tts-point-read] {")

    setEpubTtsPointReadEnabled(document, false)

    expect(paragraph?.hasAttribute("data-myreader-tts-point-read")).toBe(false)
    expect(document.getElementById("myreader-tts-point-read-style")).toBeNull()
  })

  it("shows a pointer and reads only when the pointer intersects rendered text", () => {
    document.body.innerHTML =
      '<p><span id="sentence">Readable sentence.</span></p><button id="action">Action</button>'
    const getClientRects = vi.fn(
      () =>
        [
          {
            left: 100,
            right: 200,
            top: 0,
            bottom: 30,
          } as DOMRect,
        ] as unknown as DOMRectList,
    )
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: getClientRects,
    })
    const onReadAtPoint = vi.fn()
    const disconnect = connectEpubTtsPointReadBridge(document, {
      getEnabled: () => true,
      onReadAtPoint,
    })
    setEpubTtsPointReadEnabled(document, true)

    const sentence = document.getElementById("sentence")
    const paragraph = document.querySelector("p")
    sentence?.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 150,
        clientY: 15,
      }),
    )
    expect(paragraph?.hasAttribute("data-myreader-tts-point-read-hover")).toBe(
      true,
    )

    sentence?.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 250,
        clientY: 15,
      }),
    )
    expect(paragraph?.hasAttribute("data-myreader-tts-point-read-hover")).toBe(
      false,
    )

    sentence?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 250,
        clientY: 15,
      }),
    )

    sentence?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 150,
        clientY: 15,
      }),
    )
    document.getElementById("action")?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      }),
    )

    expect(onReadAtPoint).toHaveBeenCalledOnce()
    expect(onReadAtPoint).toHaveBeenCalledWith({ x: 150, y: 15 })

    disconnect()
    setEpubTtsPointReadEnabled(document, false)
    Reflect.deleteProperty(Range.prototype, "getClientRects")
    document.body.replaceChildren()
  })

  it("preserves authored sentence languages for mixed-language narration", () => {
    const utterances = extractEpubTtsUtterances(
      [
        {
          href: "chapter.xhtml",
          type: "application/xhtml+xml",
          html: `
            <html lang="zh-CN"><body>
              <p>中文一句。<span lang="en">English sentence.</span><span lang="ja">日本語です。</span></p>
            </body></html>
          `,
        },
      ],
      [],
    )

    expect(
      utterances.map(({ plain, language }) => ({ plain, language })),
    ).toEqual([
      { plain: "中文一句。", language: "zh-CN" },
      { plain: "English sentence.", language: "en" },
      { plain: "日本語です。", language: "ja" },
    ])
  })

  it("omits marked page breaks from speech without losing the locator", () => {
    const utterances = extractEpubTtsUtterances(
      [
        {
          href: "chapter.xhtml",
          type: "application/xhtml+xml",
          html: `
            <html lang="zh-CN"><body>
              <p>正文<span role="doc-pagebreak">12</span>继续。</p>
            </body></html>
          `,
        },
      ],
      [],
      { skipPageBreaks: true },
    )

    expect(utterances).toHaveLength(1)
    expect(utterances[0]?.plain).toBe("正文继续。")
    expect(utterances[0]?.locator.text?.highlight).toBe("正文12继续。")
  })
})
