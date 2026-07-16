import { describe, expect, it } from "vitest"
import {
  compactReaderSearchSnippet,
  resolveReaderSearchResultMetadata,
  resolveReaderSearchResults,
} from "../src/reader-search"
import {
  enhanceTocItemsWithContentLocators,
  linksToTocItems,
  type ReaderLocator,
} from "../src/reader-toc"

function locator(
  href: string,
  locations: Partial<NonNullable<ReaderLocator["locations"]>> = {},
): ReaderLocator {
  return {
    href,
    type: "application/xhtml+xml",
    locations: { progression: 0, ...locations },
  }
}

describe("reader search result metadata", () => {
  it("should resolve the chapter and nearest target position when native search omits position", () => {
    const positions = Array.from({ length: 10 }, (_, index) =>
      locator("OPS/chapter-2.xhtml", {
        progression: index / 10,
        position: index + 11,
      }),
    )
    const toc = linksToTocItems(
      [{ href: "chapter-2.xhtml", title: "第二章 相遇" }],
      positions,
    )

    expect(
      resolveReaderSearchResultMetadata({
        locator: locator("OPS/chapter-2.xhtml", { progression: 0.64 }),
        positions,
        toc,
      }),
    ).toEqual({ title: "第二章 相遇", position: 17 })
  })

  it("should preserve the explicit Readium position when it is available", () => {
    expect(
      resolveReaderSearchResultMetadata({
        locator: locator("chapter.xhtml", { position: 42 }),
        fallbackTitle: "正文",
      }),
    ).toEqual({ title: "正文", position: 42 })
  })

  it("should keep the highlighted match visible when Readium returns long context", () => {
    const result = locator("chapter.xhtml")
    result.text = {
      before: `${"before ".repeat(20)} `,
      highlight: "needle",
      after: ` ${"after ".repeat(20)}`,
    }

    expect(compactReaderSearchSnippet(result, 12, 10)).toEqual({
      before: "…fore before ",
      highlight: "needle",
      after: " after aft…",
    })
  })

  it("should resolve mobile content locators into the correct shared-resource chapters", () => {
    const positions = Array.from({ length: 10 }, (_, index) =>
      locator("OPS/chapter.xhtml", {
        progression: index / 10,
        position: index + 1,
      }),
    )
    const toc = enhanceTocItemsWithContentLocators(
      linksToTocItems(
        [
          {
            href: "chapter.xhtml",
            title: "第二章",
            children: [
              { href: "chapter.xhtml", title: "第一次见面" },
              { href: "chapter.xhtml", title: "再次相遇" },
            ],
          },
        ],
        positions,
      ),
      [
        {
          text: "第一次见面",
          locator: locator("OPS/chapter.xhtml", { progression: 0.2 }),
        },
        {
          text: "再次相遇",
          locator: locator("OPS/chapter.xhtml", { progression: 0.6 }),
        },
      ],
    )
    const firstHit = locator("OPS/chapter.xhtml", { progression: 0.35 })
    firstHit.text = { highlight: "可爱" }
    const secondHit = locator("OPS/chapter.xhtml", { progression: 0.75 })
    secondHit.text = { highlight: "可爱" }

    expect(
      resolveReaderSearchResults({
        locators: [firstHit, secondHit],
        positions,
        toc,
        fallbackTitle: "正文",
      }),
    ).toEqual([
      expect.objectContaining({
        locator: firstHit,
        title: "第一次见面",
        position: 4,
        snippet: { before: "", highlight: "可爱", after: "" },
      }),
      expect.objectContaining({
        locator: secondHit,
        title: "再次相遇",
        position: 8,
        snippet: { before: "", highlight: "可爱", after: "" },
      }),
    ])
  })
})
