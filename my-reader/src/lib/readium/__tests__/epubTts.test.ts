import { Locator, LocatorLocations, LocatorText } from "@readium/shared"
import { describe, expect, it } from "vitest"
import {
  epubTtsPlaybackPlanAtLocator,
  epubTtsUtteranceIndexAtLocator,
  extractEpubTtsUtterances,
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

  it("clips a sentence to the first visible character", () => {
    const utterances = extractEpubTtsUtterances(
      [
        {
          href: "chapter.xhtml",
          type: "application/xhtml+xml",
          html: "<html><body><p>A sentence begins on the previous page and continues here. Next complete sentence.</p></body></html>",
        },
      ],
      [],
      { fallbackLanguage: "en" },
    )
    const clippedStart = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({
        progression: 0.3,
        otherLocations: new Map<string, unknown>([
          ["cssSelector", "body > p:nth-of-type(1)"],
          ["domRange", { start: { charOffset: 43 } }],
        ]),
      }),
      text: new LocatorText({
        before: "the previous page and ",
        highlight: "c",
        after: "ontinues here. Next complete",
      }),
    })
    const completeStart = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.5 }),
      text: new LocatorText({
        before: "continues here. ",
        highlight: "N",
        after: "ext complete sentence.",
      }),
    })

    const clipped = epubTtsPlaybackPlanAtLocator(utterances, clippedStart)
    const complete = epubTtsPlaybackPlanAtLocator(utterances, completeStart)

    expect(clipped?.index).toBe(0)
    expect(clipped?.utterances[0]?.plain).toBe("continues here.")
    expect(clipped?.utterances[0]?.locator.text?.highlight).toBe(
      "continues here.",
    )
    expect(clipped?.utterances[0]?.locator.locations.progression).toBe(0.3)
    expect(
      clipped?.utterances[0]?.locator.locations.otherLocations?.has("domRange"),
    ).toBe(false)
    expect(complete?.index).toBe(1)
    expect(complete?.utterances).toBe(utterances)
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
