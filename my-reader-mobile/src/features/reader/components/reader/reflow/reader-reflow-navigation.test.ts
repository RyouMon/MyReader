import type { Link, Locator } from "@my-reader/readium"

import {
  buildTocItemId,
  enhanceTocItemsWithContentLocators,
  findLocatorForLinkHref,
  linksToTocItems,
  locatorForTocLink,
  locatorWithTocSelection,
  resolveNativeLocator,
} from "./reader-reflow-navigation"
import {
  hrefRoughlyMatches,
  locatorWithHrefFragments,
  positionIndexForLocator,
  resolveReaderToc,
  stripFragment,
} from "../reader-toc-resolver"

function locator(
  href: string,
  locations: Partial<NonNullable<Locator["locations"]>> = {},
): Locator {
  return { href, locations: { progression: 0, ...locations } } as Locator
}

function resolvedTitle(
  toc: ReturnType<typeof linksToTocItems>,
  positions: Locator[],
  locator: Locator,
): string | undefined {
  return resolveReaderToc({ toc, positions, locator }).title ?? undefined
}

const positions = [
  locator("OPS/chapter-1.xhtml", { position: 1, totalProgression: 0 }),
  locator("OPS/chapter-2.xhtml", { position: 2, totalProgression: 0.5 }),
  locator("OPS/chapter-3.xhtml", { position: 3, totalProgression: 1 }),
]

describe("reader reflow href matching", () => {
  it("should remove fragment when href contains a hash", () => {
    expect(stripFragment("OPS/chapter.xhtml#section")).toBe("OPS/chapter.xhtml")
  })

  it("should keep href unchanged when href has no fragment", () => {
    expect(stripFragment("OPS/chapter.xhtml")).toBe("OPS/chapter.xhtml")
  })

  it("should match hrefs when fragments or prefixes differ", () => {
    expect(
      hrefRoughlyMatches("OPS/chapter-1.xhtml#p1", "chapter-1.xhtml"),
    ).toBe(true)
    expect(hrefRoughlyMatches("chapter-2.xhtml", "OPS/chapter-2.xhtml")).toBe(
      true,
    )
  })

  it("should reject hrefs when either side is empty or unrelated", () => {
    expect(hrefRoughlyMatches("", "chapter.xhtml")).toBe(false)
    expect(hrefRoughlyMatches("chapter.xhtml", "")).toBe(false)
    expect(hrefRoughlyMatches("chapter-a.xhtml", "chapter-b.xhtml")).toBe(false)
  })
})

describe("reader reflow locator resolution", () => {
  it("should find locator when link href roughly matches a position", () => {
    expect(findLocatorForLinkHref(positions, "chapter-2.xhtml")).toBe(
      positions[1],
    )
  })

  it("should return undefined when link href or positions are missing", () => {
    expect(findLocatorForLinkHref(positions, undefined)).toBeUndefined()
    expect(findLocatorForLinkHref([], "chapter-1.xhtml")).toBeUndefined()
  })

  it("should preserve fragment hrefs when creating toc locators", () => {
    const tocLocator = locatorForTocLink(
      {
        href: "chapter-2.xhtml#section-1",
        title: "Section 1",
      } as Link,
      positions,
    )

    expect(tocLocator).toEqual({
      href: "chapter-2.xhtml#section-1",
      type: "application/xhtml+xml",
      title: "Section 1",
      locations: {
        progression: 0,
        position: 2,
        totalProgression: 0.5,
      },
    })
  })

  it("should preserve native location while applying selected toc href and title", () => {
    const nativeLocator = locator("OPS/chapter-2.xhtml", {
      progression: 0.8,
      totalProgression: 0.52,
    })

    expect(
      locatorWithTocSelection(nativeLocator, {
        id: "section",
        label: "Section 1",
        href: "chapter-2.xhtml#section-1",
        pageIndex: 1,
      }),
    ).toEqual({
      ...nativeLocator,
      href: "chapter-2.xhtml#section-1",
      title: "Section 1",
    })
  })

  it("should append native locator fragments to href", () => {
    const nativeLocator = locator("OPS/chapter-2.xhtml", {
      fragments: ["section-2"],
      progression: 0.8,
    })

    expect(locatorWithHrefFragments(nativeLocator)).toEqual({
      ...nativeLocator,
      href: "OPS/chapter-2.xhtml#section-2",
    })
  })

  it("should prefer native locator fragments over stale selected toc", () => {
    const nativeLocator = locator("OPS/chapter-2.xhtml", {
      fragments: ["section-2"],
      progression: 0.8,
    })

    expect(
      locatorWithTocSelection(nativeLocator, {
        id: "section-1",
        label: "Section 1",
        href: "chapter-2.xhtml#section-1",
        pageIndex: 1,
      }),
    ).toEqual({
      ...nativeLocator,
      href: "OPS/chapter-2.xhtml#section-2",
    })
  })

  it("should keep native locator when selected toc belongs elsewhere", () => {
    const nativeLocator = locator("OPS/chapter-3.xhtml")

    expect(
      locatorWithTocSelection(nativeLocator, {
        id: "section",
        label: "Section 1",
        href: "chapter-2.xhtml#section-1",
        pageIndex: 1,
      }),
    ).toBe(nativeLocator)
  })

  it("should return href index when locator href matches a position", () => {
    expect(positionIndexForLocator(positions, locator("chapter-3.xhtml"))).toBe(
      2,
    )
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

  it("should return rounded progression index when href does not match", () => {
    expect(
      positionIndexForLocator(
        positions,
        locator("missing.xhtml", { progression: 0.51 }),
      ),
    ).toBe(1)
  })

  it("should clamp progression index when progression is out of range", () => {
    expect(
      positionIndexForLocator(
        positions,
        locator("missing.xhtml", { totalProgression: 2 }),
      ),
    ).toBe(2)
  })

  it("should return first index when positions or usable locator data are missing", () => {
    expect(positionIndexForLocator([], locator("chapter.xhtml"))).toBe(0)
    expect(positionIndexForLocator(positions, locator("missing.xhtml"))).toBe(0)
    expect(
      positionIndexForLocator(
        positions,
        locator("missing.xhtml", { progression: Number.NaN }),
      ),
    ).toBe(0)
  })

  it("should resolve native locator by href when stored position differs", () => {
    expect(
      resolveNativeLocator(
        positions,
        locator("chapter-2.xhtml", { position: 3 }),
      ),
    ).toBe(positions[1])
  })

  it("should resolve native locator by stored position when total progression agrees", () => {
    expect(
      resolveNativeLocator(
        positions,
        locator("chapter-1.xhtml", { position: 2, totalProgression: 0.5 }),
      ),
    ).toBe(positions[1])
  })

  it("should resolve native locator by stored position when same href repeats", () => {
    const chapterPositions = Array.from({ length: 50 }, (_, index) =>
      locator(index < 47 ? "OPS/chapter-1.xhtml" : "OPS/chapter-2.xhtml", {
        position: index + 1,
      }),
    )

    expect(
      resolveNativeLocator(
        chapterPositions,
        locator("OPS/chapter-2.xhtml", { position: 50 }),
      ),
    ).toBe(chapterPositions[49])
  })

  it("should resolve native locator by stored position when href misses", () => {
    expect(
      resolveNativeLocator(
        positions,
        locator("missing.xhtml", { position: 3 }),
      ),
    ).toBe(positions[2])
  })

  it("should resolve native locator by progression when position is invalid", () => {
    expect(
      resolveNativeLocator(
        positions,
        locator("missing.xhtml", { position: 9, totalProgression: 0.5 }),
      ),
    ).toBe(positions[1])
  })

  it("should return undefined when no native locator can be resolved", () => {
    expect(resolveNativeLocator([], locator("chapter.xhtml"))).toBeUndefined()
    expect(
      resolveNativeLocator(
        positions,
        locator("missing.xhtml", { progression: Number.NaN }),
      ),
    ).toBeUndefined()
  })
})

describe("reader reflow toc", () => {
  it("should build stable toc item ids when href is present or missing", () => {
    expect(buildTocItemId("readium", [0, 1], "chapter.xhtml")).toBe(
      "readium-0.1-chapter.xhtml",
    )
    expect(buildTocItemId("readium", [0], undefined)).toBe("readium-0-no-href")
  })

  it("should flatten nested links when building toc items", () => {
    const links: Link[] = [
      {
        href: "chapter-1.xhtml",
        title: "Intro",
        children: [{ href: "chapter-2.xhtml" } as Link],
      } as Link,
      { href: "missing.xhtml", title: "Missing" } as Link,
    ]

    expect(linksToTocItems(links, positions)).toEqual([
      expect.objectContaining({
        id: "readium-0-chapter-1.xhtml",
        label: "Intro",
        pageIndex: 0,
        chapterIndex: 0,
        locator: positions[0],
      }),
      expect.objectContaining({
        id: "readium-0.0-chapter-2.xhtml",
        label: "Chapter 2",
        pageIndex: 1,
        chapterIndex: 1,
        locator: positions[1],
      }),
      expect.objectContaining({
        id: "readium-1-missing.xhtml",
        label: "Missing",
        pageIndex: 2,
        chapterIndex: 2,
        locator: undefined,
      }),
    ])
  })

  it("should keep fragment locators when building nested toc items", () => {
    const links: Link[] = [
      {
        href: "chapter-2.xhtml",
        title: "Chapter 2",
        children: [
          {
            href: "chapter-2.xhtml#section-1",
            title: "Section 1",
          } as Link,
        ],
      } as Link,
    ]

    expect(linksToTocItems(links, positions)).toEqual([
      expect.objectContaining({
        label: "Chapter 2",
        locator: positions[1],
      }),
      expect.objectContaining({
        label: "Section 1",
        locator: expect.objectContaining({
          href: "chapter-2.xhtml#section-1",
          title: "Section 1",
        }),
      }),
    ])
  })

  it("should resolve chapter title from toc when locator has no title", () => {
    const links: Link[] = [
      { href: "chapter-1.xhtml", title: "Intro" } as Link,
      { href: "chapter-2.xhtml", title: "Second Chapter" } as Link,
    ]
    const tocItems = linksToTocItems(links, positions)

    expect(resolvedTitle(tocItems, positions, locator("chapter-2.xhtml"))).toBe(
      "Second Chapter",
    )
  })

  it("should resolve subchapter title when locator href includes a fragment", () => {
    const links: Link[] = [
      {
        href: "chapter-2.xhtml",
        title: "Second Chapter",
        children: [
          {
            href: "chapter-2.xhtml#section-1",
            title: "Section 1",
          } as Link,
        ],
      } as Link,
    ]
    const tocItems = linksToTocItems(links, positions)

    expect(
      resolvedTitle(tocItems, positions, locator("chapter-2.xhtml#section-1")),
    ).toBe("Section 1")
  })

  it("should resolve subchapter title when native locator carries fragments", () => {
    const links: Link[] = [
      {
        href: "chapter-2.xhtml",
        title: "Second Chapter",
        children: [
          {
            href: "chapter-2.xhtml#section-1",
            title: "Section 1",
          } as Link,
        ],
      } as Link,
    ]
    const tocItems = linksToTocItems(links, positions)

    expect(
      resolvedTitle(
        tocItems,
        positions,
        locator("chapter-2.xhtml", { fragments: ["section-1"] }),
      ),
    ).toBe("Section 1")
  })

  it("should enhance toc locators from matching content headings", () => {
    const tocItems = linksToTocItems(
      [
        {
          href: "text00010.html",
          title: "Volume I",
          children: [
            {
              href: "text00010.html#bw6",
              title: "2.1 First Impressions",
            } as Link,
            {
              href: "text00010.html#bw7",
              title: "2.2 Netherfield Park",
            } as Link,
          ],
        } as Link,
      ],
      [
        locator("OEBPS/text00010.html", {
          position: 47,
          totalProgression: 0.16,
        }),
      ],
    )

    const enhanced = enhanceTocItemsWithContentLocators(tocItems, [
      {
        text: "2.1 First Impressions",
        locator: locator("OEBPS/text00010.html", {
          progression: 0.02,
          position: 48,
          totalProgression: 0.17,
        }),
      },
      {
        text: "2.2 Netherfield Park",
        locator: locator("OEBPS/text00010.html", {
          progression: 0.12,
          position: 52,
          totalProgression: 0.19,
        }),
      },
    ])

    expect(enhanced[2]?.locator).toEqual(
      expect.objectContaining({
        href: "text00010.html#bw7",
        title: "2.2 Netherfield Park",
        locations: expect.objectContaining({
          fragments: ["bw7"],
          position: 52,
        }),
      }),
    )
  })

  it("should enhance toc locators when content heading is a prefix of toc label", () => {
    const tocItems = linksToTocItems(
      [
        {
          href: "text00014.html",
          title: "Chapter 6",
          children: [
            {
              href: "text00014.html#bw47",
              title: "6.6 The Spouter-Inn",
            } as Link,
          ],
        } as Link,
      ],
      [
        locator("OEBPS/text00014.html", {
          position: 103,
          totalProgression: 0.35,
        }),
      ],
    )

    const enhanced = enhanceTocItemsWithContentLocators(tocItems, [
      {
        text: "6.6 The Spouter",
        locator: locator("OEBPS/text00014.html", {
          progression: 0.6,
          position: 113,
          totalProgression: 0.39,
        }),
      },
    ])

    expect(enhanced[1]?.locator).toEqual(
      expect.objectContaining({
        href: "text00014.html#bw47",
        title: "6.6 The Spouter-Inn",
        locations: expect.objectContaining({
          fragments: ["bw47"],
          position: 113,
        }),
      }),
    )
  })

  it("should resolve same-resource subchapter title from enhanced positions", () => {
    const chapterPositions = Array.from({ length: 60 }, (_, index) =>
      locator("OEBPS/text00010.html", { position: index + 1 }),
    )
    const tocItems = linksToTocItems(
      [
        {
          href: "text00010.html",
          title: "Volume I",
          children: [
            {
              href: "text00010.html#bw6",
              title: "2.1 First Impressions",
            } as Link,
            {
              href: "text00010.html#bw7",
              title: "2.2 Netherfield Park",
            } as Link,
          ],
        } as Link,
      ],
      chapterPositions,
    )
    const enhanced = enhanceTocItemsWithContentLocators(tocItems, [
      {
        text: "2.1 First Impressions",
        locator: locator("OEBPS/text00010.html", { position: 48 }),
      },
      {
        text: "2.2 Netherfield Park",
        locator: locator("OEBPS/text00010.html", { position: 52 }),
      },
    ])

    expect(
      resolvedTitle(
        enhanced,
        chapterPositions,
        locator("OEBPS/text00010.html", { position: 53 }),
      ),
    ).toBe("2.2 Netherfield Park")
  })

  it("should keep current same-resource subchapter title before the next start", () => {
    const chapterPositions = Array.from({ length: 120 }, (_, index) =>
      locator("OEBPS/text00014.html", { position: index + 1 }),
    )
    const tocItems = linksToTocItems(
      [
        {
          href: "text00014.html",
          title: "Chapter 6",
          children: [
            {
              href: "text00014.html#bw46",
              title: "6.5 Breakfast",
            } as Link,
            {
              href: "text00014.html#bw47",
              title: "6.6 The Street",
            } as Link,
          ],
        } as Link,
      ],
      chapterPositions,
    )
    const enhanced = enhanceTocItemsWithContentLocators(tocItems, [
      {
        text: "6.5 Breakfast",
        locator: locator("OEBPS/text00014.html", {
          position: 111,
          progression: 0.515,
        }),
      },
      {
        text: "6.6 The Street",
        locator: locator("OEBPS/text00014.html", {
          position: 113,
          progression: 0.606,
        }),
      },
    ])

    expect(
      resolvedTitle(
        enhanced,
        chapterPositions,
        locator("OEBPS/text00014.html", {
          progression: 0.575,
          position: 112,
        }),
      ),
    ).toBe("6.5 Breakfast")
  })

  it("should not use next same-resource subchapter title two pages early", () => {
    const chapterPositions = Array.from({ length: 120 }, (_, index) =>
      locator("OEBPS/text00014.html", { position: index + 1 }),
    )
    const tocItems = linksToTocItems(
      [
        {
          href: "text00014.html",
          title: "Chapter 6",
          children: [
            {
              href: "text00014.html#bw46",
              title: "6.5 Breakfast",
            } as Link,
            {
              href: "text00014.html#bw47",
              title: "6.6 The Street",
            } as Link,
          ],
        } as Link,
      ],
      chapterPositions,
    )
    const enhanced = enhanceTocItemsWithContentLocators(tocItems, [
      {
        text: "6.5 Breakfast",
        locator: locator("OEBPS/text00014.html", {
          position: 111,
          progression: 0.515,
        }),
      },
      {
        text: "6.6 The Street",
        locator: locator("OEBPS/text00014.html", {
          position: 113,
          progression: 0.606,
        }),
      },
    ])

    expect(
      resolvedTitle(
        enhanced,
        chapterPositions,
        locator("OEBPS/text00014.html", {
          progression: 0.545,
          position: 111,
        }),
      ),
    ).toBe("6.5 Breakfast")
  })

  it("should keep current same-resource subchapter when later content locators are complete", () => {
    const chapterPositions = Array.from({ length: 120 }, (_, index) =>
      locator("OEBPS/text00014.html", { position: index + 1 }),
    )
    const children = [
      "6.1 Loomings",
      "6.2 The Carpet-Bag",
      "6.3 The Spouter-Inn",
      "6.4 The Counterpane",
      "6.5 Breakfast",
      "6.6 The Street",
      "6.7 The Chapel",
      "6.8 The Pulpit",
      "6.9 The Sermon",
    ].map(
      (title, index) =>
        ({
          href: `text00014.html#bw${42 + index}`,
          title,
        }) as Link,
    )
    const tocItems = linksToTocItems(
      [
        {
          href: "text00014.html",
          title: "Chapter 6",
          children,
        } as Link,
      ],
      chapterPositions,
    )
    const progressions = [0.1, 0.2, 0.3, 0.4, 0.515, 0.606, 0.7, 0.8, 0.9]
    const positions = [103, 104, 106, 108, 111, 114, 116, 118, 120]
    const enhanced = enhanceTocItemsWithContentLocators(
      tocItems,
      children.map((child, index) => ({
        text: child.title ?? "",
        locator: locator("OEBPS/text00014.html", {
          position: positions[index],
          progression: progressions[index],
        }),
      })),
    )

    expect(
      resolvedTitle(
        enhanced,
        chapterPositions,
        locator("OEBPS/text00014.html", {
          progression: 0.575,
          position: 112,
        }),
      ),
    ).toBe("6.5 Breakfast")
  })

  it("should keep current same-resource subchapter when later content locator is missing", () => {
    const chapterPositions = Array.from({ length: 120 }, (_, index) =>
      locator("OEBPS/text00014.html", { position: index + 1 }),
    )
    const children = [
      "6.1 Loomings",
      "6.2 The Carpet-Bag",
      "6.3 The Spouter-Inn",
      "6.4 The Counterpane",
      "6.5 Breakfast",
      "6.6 The Street",
      "6.7 The Chapel",
      "6.8 The Pulpit",
      "6.9 The Sermon",
    ].map(
      (title, index) =>
        ({
          href: `text00014.html#bw${42 + index}`,
          title,
        }) as Link,
    )
    const tocItems = linksToTocItems(
      [
        {
          href: "text00014.html",
          title: "Chapter 6",
          children,
        } as Link,
      ],
      chapterPositions,
    )
    const enhanced = enhanceTocItemsWithContentLocators(tocItems, [
      {
        text: "6.5 Breakfast",
        locator: locator("OEBPS/text00014.html", {
          position: 111,
          progression: 0.515,
        }),
      },
    ])

    expect(
      resolvedTitle(
        enhanced,
        chapterPositions,
        locator("OEBPS/text00014.html", {
          progression: 0.575,
          position: 112,
        }),
      ),
    ).toBe("6.5 Breakfast")
  })

  it("should prefer nested subchapter title when parent shares the same position", () => {
    const chapterPositions = Array.from({ length: 60 }, (_, index) =>
      locator(index < 46 ? "OEBPS/text00009.html" : "OEBPS/text00010.html", {
        position: index + 1,
      }),
    )
    const tocItems = linksToTocItems(
      [
        {
          href: "text00010.html",
          title: "Chapter 2",
          children: [
            {
              href: "text00010.html#bw6",
              title: "2.1 First Impressions",
            } as Link,
          ],
        } as Link,
      ],
      chapterPositions,
    )
    const enhanced = enhanceTocItemsWithContentLocators(tocItems, [
      {
        text: "2.1 First Impressions",
        locator: locator("OEBPS/text00010.html", { position: 47 }),
      },
    ])

    expect(
      resolvedTitle(
        enhanced,
        chapterPositions,
        locator("OEBPS/text00010.html", { position: 53 }),
      ),
    ).toBe("2.1 First Impressions")
  })

  it("should keep parent title when unresolved child fragments reuse its resource position", () => {
    const bookPositions = Array.from({ length: 90 }, (_, index) =>
      locator(index < 68 ? "OEBPS/text00010.html" : "OEBPS/text00011.html", {
        position: index + 1,
        progression: index < 68 ? 0.95 : 0,
        totalProgression: index / 89,
      }),
    )
    const tocItems = linksToTocItems(
      [
        {
          href: "text00011.html",
          title: "Chapter 3",
          children: [
            {
              href: "text00011.html#bw14",
              title: "3.1 Duplicated Code",
            } as Link,
            {
              href: "text00011.html#bw25",
              title: "3.12 Lazy Class",
            } as Link,
          ],
        } as Link,
      ],
      bookPositions,
    )

    expect(
      resolveReaderToc({
        toc: tocItems,
        positions: bookPositions,
        locator: locator("OEBPS/text00011.html", {
          position: 70,
          progression: 0.03,
          totalProgression: 69 / 89,
        }),
        currentTitle: "Chapter 3",
      }),
    ).toMatchObject({
      title: "Chapter 3",
    })
  })

  it("should keep parent title at its exact shared start position", () => {
    const chapterPositions = Array.from({ length: 60 }, (_, index) =>
      locator(index < 46 ? "OEBPS/text00009.html" : "OEBPS/text00010.html", {
        position: index + 1,
      }),
    )
    const tocItems = linksToTocItems(
      [
        {
          href: "text00010.html",
          title: "Chapter 2",
          children: [
            {
              href: "text00010.html#bw6",
              title: "2.1 First Impressions",
            } as Link,
          ],
        } as Link,
      ],
      chapterPositions,
    )
    const enhanced = enhanceTocItemsWithContentLocators(tocItems, [
      {
        text: "2.1 First Impressions",
        locator: locator("OEBPS/text00010.html", { position: 47 }),
      },
    ])

    expect(
      resolvedTitle(
        enhanced,
        chapterPositions,
        locator("OEBPS/text00010.html", { position: 47 }),
      ),
    ).toBe("Chapter 2")
  })

  it("should prefer a child chapter when a toc container shares its exact href", () => {
    const chapterPositions = Array.from({ length: 30 }, (_, index) =>
      locator(
        index < 9 ? "OEBPS/Text/contents.xhtml" : "OEBPS/Text/chapter1.xhtml",
        { position: index + 1 },
      ),
    )
    const tocItems = linksToTocItems(
      [
        {
          href: "Text/chapter1.xhtml",
          title: "Alice's Adventures in Wonderland",
          children: [
            {
              href: "Text/chapter1.xhtml",
              title: "Chapter I. Down the Rabbit-Hole",
            } as Link,
            {
              href: "Text/chapter2.xhtml",
              title: "Chapter II. The Pool of Tears",
            } as Link,
          ],
        } as Link,
      ],
      chapterPositions,
    )

    expect(
      resolvedTitle(
        tocItems,
        chapterPositions,
        locator("OEBPS/Text/chapter1.xhtml", { position: 10 }),
      ),
    ).toBe("Chapter I. Down the Rabbit-Hole")
  })

  it("should prefer same-resource progression when page position has advanced too far", () => {
    const chapterPositions = Array.from({ length: 90 }, (_, index) =>
      locator("OEBPS/text00011.html", { position: index + 1 }),
    )
    const tocItems = linksToTocItems(
      [
        {
          href: "text00011.html",
          title: "Chapter 3",
          children: [
            {
              href: "text00011.html#bw20",
              title: "3.6 The Street",
            } as Link,
            {
              href: "text00011.html#bw36",
              title: "3.22 Cetology",
            } as Link,
          ],
        } as Link,
      ],
      chapterPositions,
    )
    const enhanced = enhanceTocItemsWithContentLocators(tocItems, [
      {
        text: "3.6 The Street",
        locator: locator("OEBPS/text00011.html", {
          progression: 0.34,
          position: 60,
        }),
      },
      {
        text: "3.22 Cetology",
        locator: locator("OEBPS/text00011.html", {
          progression: 0.86,
          position: 73,
        }),
      },
    ])

    expect(
      resolvedTitle(
        enhanced,
        chapterPositions,
        locator("OEBPS/text00011.html", {
          progression: 0.357,
          position: 74,
        }),
      ),
    ).toBe("3.6 The Street")
  })

  it("should resolve a new resource chapter before its heading progression catches up", () => {
    const bookPositions = Array.from({ length: 20 }, (_, index) =>
      locator(index < 12 ? "text/part0004.html" : "text/part0005.html", {
        position: index + 1,
      }),
    )
    const tocItems = linksToTocItems(
      [
        {
          href: "text/part0004.html",
          title: "Preface",
        } as Link,
        {
          href: "text/part0005.html",
          title: "Chapter I. Down the Rabbit-Hole",
        } as Link,
      ],
      bookPositions,
    )
    const enhanced = enhanceTocItemsWithContentLocators(tocItems, [
      {
        text: "Chapter I. Down the Rabbit-Hole",
        locator: locator("text/part0005.html", {
          progression: 0.12,
          position: 14,
        }),
      },
    ])

    expect(
      resolvedTitle(
        enhanced,
        bookPositions,
        locator("text/part0005.html", {
          progression: 0,
          position: 12,
        }),
      ),
    ).toBe("Chapter I. Down the Rabbit-Hole")
  })

  it("should use the advanced position when a cross-resource locator keeps the previous href", () => {
    const bookPositions = Array.from({ length: 20 }, (_, index) =>
      locator(index < 12 ? "text/part0004.html" : "text/part0005.html", {
        position: index + 1,
      }),
    )
    const tocItems = linksToTocItems(
      [
        {
          href: "text/part0004.html",
          title: "Preface",
        } as Link,
        {
          href: "text/part0005.html",
          title: "Chapter I. Down the Rabbit-Hole",
        } as Link,
      ],
      bookPositions,
    )

    expect(
      resolvedTitle(
        tocItems,
        bookPositions,
        locator("text/part0004.html", {
          progression: 0.8,
          position: 13,
        }),
      ),
    ).toBe("Chapter I. Down the Rabbit-Hole")
  })

  it("should keep the nearest previous toc title when locator href is unmatched", () => {
    const links: Link[] = [
      { href: "chapter-1.xhtml", title: "Intro" } as Link,
      { href: "chapter-2.xhtml", title: "Second Chapter" } as Link,
    ]
    const tocItems = linksToTocItems(links, positions)

    expect(
      resolvedTitle(
        tocItems,
        positions,
        locator("unmatched.xhtml", { totalProgression: 0.9 }),
      ),
    ).toBe("Second Chapter")
  })
})
