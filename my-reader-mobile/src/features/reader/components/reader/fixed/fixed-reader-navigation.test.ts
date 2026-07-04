import type { Link, Locator } from "@my-reader/readium"
import {
  chapterTitleForFixedLocator,
  hasTocTitle,
  linksToFixedTocItems,
  positionIndexForLocator,
  resolveNativeLocator,
} from "./fixed-reader-navigation"

function locator(href: string, locations: Locator["locations"]): Locator {
  return {
    href,
    type: "application/pdf",
    locations,
  }
}

describe("fixed reader navigation", () => {
  const pdfPositions = [
    locator("book.pdf", { progression: 0, position: 1, totalProgression: 0 }),
    locator("book.pdf", {
      progression: 0,
      position: 2,
      totalProgression: 0.5,
    }),
    locator("book.pdf", { progression: 0, position: 3, totalProgression: 1 }),
  ]

  it("should use locator position before href when PDF pages share one href", () => {
    expect(
      positionIndexForLocator(
        pdfPositions,
        locator("book.pdf", {
          progression: 0,
          position: 3,
          totalProgression: 1,
        }),
      ),
    ).toBe(2)
  })

  it("should resolve stored PDF locator by position when href matches multiple pages", () => {
    expect(
      resolveNativeLocator(
        pdfPositions,
        locator("book.pdf", {
          progression: 0,
          position: 2,
          totalProgression: 0.5,
        }),
      ),
    ).toBe(pdfPositions[1])
  })

  it("should use progression before href when positions share one href", () => {
    expect(
      positionIndexForLocator(
        pdfPositions,
        locator("book.pdf", { progression: 0.5, totalProgression: 0.5 }),
      ),
    ).toBe(1)
  })

  it("should keep unique href matching when image positions have distinct hrefs", () => {
    const positions = [
      locator("page-1.jpg", { progression: 0 }),
      locator("page-2.jpg", { progression: 0 }),
    ]

    expect(
      positionIndexForLocator(
        positions,
        locator("page-2.jpg", { progression: 0 }),
      ),
    ).toBe(1)
  })

  it("should detect publication toc titles when titles are nested", () => {
    const links: Link[] = [
      {
        href: "book.pdf#page=1",
        children: [{ href: "book.pdf#page=2", title: "Chapter 1" } as Link],
      } as Link,
    ]

    expect(hasTocTitle(links)).toBe(true)
  })

  it("should build fixed toc items when PDF outline links are available", () => {
    const links: Link[] = [
      { href: "book.pdf#page=2", title: "Chapter 1" } as Link,
      { href: "book.pdf#page=3", title: "Chapter 2" } as Link,
    ]

    expect(
      linksToFixedTocItems(links, pdfPositions, (i) => `Page ${i + 1}`),
    ).toEqual([
      expect.objectContaining({
        label: "Chapter 1",
        pageIndex: 0,
        href: "book.pdf#page=2",
        locator: pdfPositions[1],
      }),
      expect.objectContaining({
        label: "Chapter 2",
        pageIndex: 1,
        href: "book.pdf#page=3",
        locator: pdfPositions[2],
      }),
    ])
  })

  it("should resolve active PDF chapter title when current page follows a toc item", () => {
    const tocItems = linksToFixedTocItems(
      [
        { href: "book.pdf#page=2", title: "Chapter 1" } as Link,
        { href: "book.pdf#page=4", title: "Chapter 2" } as Link,
      ],
      pdfPositions,
      (i) => `Page ${i + 1}`,
    )

    expect(
      chapterTitleForFixedLocator(tocItems, pdfPositions, pdfPositions[2]!),
    ).toBe("Chapter 1")
  })
})
