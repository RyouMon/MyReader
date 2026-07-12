import { describe, expect, it } from "vitest"
import {
  enhanceTocItemsWithContentLocators,
  hrefRoughlyMatches,
  linksToTocItems,
  locatorWithHrefFragments,
  positionIndexForLocator,
  resolveReaderToc,
  resolveReaderTocAtPosition,
  type ReaderLink,
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

const positions = [
  locator("OPS/chapter-1.xhtml", { position: 1, totalProgression: 0 }),
  locator("OPS/chapter-2.xhtml", { position: 2, totalProgression: 0.5 }),
  locator("OPS/chapter-3.xhtml", { position: 3, totalProgression: 1 }),
]

describe("reader toc utilities", () => {
  it("should match hrefs when fragments or prefixes differ", () => {
    expect(
      hrefRoughlyMatches("OPS/chapter-1.xhtml#p1", "chapter-1.xhtml"),
    ).toBe(true)
  })

  it("should preserve locator fragments in hrefs", () => {
    expect(
      locatorWithHrefFragments(
        locator("OPS/chapter-2.xhtml", { fragments: ["section-2"] }),
      ).href,
    ).toBe("OPS/chapter-2.xhtml#section-2")
  })

  it("should prefer native position when multiple positions share one href", () => {
    const chapterPositions = [
      locator("OPS/chapter-2.xhtml", { position: 48 }),
      locator("OPS/chapter-2.xhtml", { position: 49 }),
      locator("OPS/chapter-2.xhtml", { position: 50 }),
    ]

    expect(
      positionIndexForLocator(
        chapterPositions,
        locator("OPS/chapter-2.xhtml", { position: 50 }),
      ),
    ).toBe(2)
  })

  it("should flatten nested readium links into toc items", () => {
    const links: ReaderLink[] = [
      {
        href: "chapter-1.xhtml",
        title: "Intro",
        children: [{ href: "chapter-2.xhtml" }],
      },
    ]

    expect(linksToTocItems(links, positions)).toEqual([
      expect.objectContaining({
        id: "readium-0-chapter-1.xhtml",
        label: "Intro",
        depth: 0,
        locator: positions[0],
      }),
      expect.objectContaining({
        id: "readium-0.0-chapter-2.xhtml",
        label: "Chapter 2",
        depth: 1,
        locator: positions[1],
      }),
    ])
  })

  it("should resolve a subchapter title from locator fragments", () => {
    const toc = linksToTocItems(
      [
        {
          href: "chapter-2.xhtml",
          title: "Second Chapter",
          children: [
            {
              href: "chapter-2.xhtml#section-1",
              title: "Section 1",
            },
          ],
        },
      ],
      positions,
    )

    expect(
      resolveReaderToc({
        toc,
        positions,
        locator: locator("chapter-2.xhtml", { fragments: ["section-1"] }),
      }).title,
    ).toBe("Section 1")
  })

  it("should prefer selected toc item when rows share the same href", () => {
    const toc = linksToTocItems(
      [
        {
          href: "chapter-3.xhtml",
          title: "第三章 情绪Emotion",
          children: [
            { href: "chapter-3.xhtml", title: "敬畏的力量" },
            { href: "chapter-3.xhtml", title: "任何情感都能激发共享行为吗" },
          ],
        },
      ],
      [locator("OEBPS/chapter-3.xhtml", { position: 70 })],
    )

    expect(
      resolveReaderToc({
        toc,
        locator: locator("OEBPS/chapter-3.xhtml", { position: 70 }),
        selectedTocItem: toc[1],
      }).item?.id,
    ).toBe(toc[1]?.id)
  })

  it("should resolve subchapters when they share one content resource", () => {
    const chapterPositions = Array.from({ length: 10 }, (_, index) =>
      locator("OPS/chapter-3.xhtml", {
        position: index + 1,
        progression: index / 10,
      }),
    )
    const toc = linksToTocItems(
      [
        {
          href: "chapter-3.xhtml",
          title: "第三章",
          children: [
            { href: "chapter-3.xhtml", title: "敬畏的力量" },
            { href: "chapter-3.xhtml", title: "聚焦于情感" },
          ],
        },
      ],
      chapterPositions,
    )
    const enhanced = enhanceTocItemsWithContentLocators(toc, [
      {
        text: "敬畏的力量",
        locator: locator("OPS/chapter-3.xhtml", {
          position: 3,
          progression: 0.2,
        }),
      },
      {
        text: "聚焦于情感",
        locator: locator("OPS/chapter-3.xhtml", {
          position: 7,
          progression: 0.6,
        }),
      },
    ])

    expect(
      resolveReaderToc({
        toc: enhanced,
        positions: chapterPositions,
        locator: locator("OPS/chapter-3.xhtml", {
          position: 8,
          progression: 0.7,
        }),
      }).title,
    ).toBe("聚焦于情感")
  })

  it("should resolve a nested chapter when given a position index", () => {
    const chapterPositions = [
      locator("OPS/chapter-3.xhtml", {
        position: 1,
        progression: 0,
      }),
      locator("OPS/chapter-3.xhtml", {
        position: 2,
        progression: 0.6,
      }),
    ]
    const toc = enhanceTocItemsWithContentLocators(
      linksToTocItems(
        [
          {
            href: "chapter-3.xhtml",
            title: "第三章",
            children: [
              {
                href: "chapter-3.xhtml#section-3",
                title: "第三节 论总能提供地租的生产物",
              },
            ],
          },
        ],
        chapterPositions,
      ),
      [
        {
          text: "第三节 论总能提供地租的生产物",
          locator: locator("OPS/chapter-3.xhtml", {
            fragments: ["section-3"],
            position: 2,
            progression: 0.6,
          }),
        },
      ],
    )

    expect(
      resolveReaderTocAtPosition({
        toc,
        positions: chapterPositions,
        positionIndex: 1,
      }).title,
    ).toBe("第三节 论总能提供地租的生产物")
  })

  it("should prefer the anchored heading when a summary repeats its title", () => {
    const chapterPositions = Array.from({ length: 10 }, (_, index) =>
      locator("OPS/chapter-3.xhtml", {
        position: index + 1,
        progression: index / 10,
      }),
    )
    const toc = linksToTocItems(
      [
        {
          href: "chapter-3.xhtml#section-6",
          title: "聚焦于情感",
        },
      ],
      chapterPositions,
    )
    const enhanced = enhanceTocItemsWithContentLocators(toc, [
      {
        text: "聚焦于情感",
        locator: locator("OPS/chapter-3.xhtml", {
          position: 1,
          progression: 0.02,
        }),
      },
      {
        text: "聚焦于情感",
        locator: locator("OPS/chapter-3.xhtml", {
          fragments: ["section-6"],
          position: 7,
          progression: 0.65,
        }),
      },
    ])

    expect(enhanced[0]?.locator?.locations).toMatchObject({
      fragments: ["section-6"],
      position: 7,
      progression: 0.65,
    })
  })
})
