import type { ReaderLocator } from "@my-reader/tools/reader-toc"

import { resolveReaderBookmarkNavigationLocator } from "./reader-bookmark-navigation"

function locator(
  href: string,
  position: number,
  progression = 0,
): ReaderLocator {
  return {
    href,
    type: "application/xhtml+xml",
    locations: { progression, position },
  }
}

describe("resolveReaderBookmarkNavigationLocator", () => {
  it("should preserve the complete stored locator for reflowable publications", () => {
    const stored: ReaderLocator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        progression: 0.42,
        position: 2,
        fragments: ["paragraph-7"],
        cssSelector: "#paragraph-7",
        partialCfi: "/4/8",
      },
      text: { highlight: "precise bookmark" },
    }
    const positions = [
      locator("native/chapter.xhtml", 1),
      locator("native/chapter.xhtml", 2, 0.5),
    ]

    const result = resolveReaderBookmarkNavigationLocator(
      stored,
      positions,
      "reflowable",
    )

    expect(result).toBe(stored)
    expect(result.locations).toEqual(stored.locations)
    expect(result.text).toEqual(stored.text)
  })

  it("should map a fixed-layout bookmark to the current native position locator", () => {
    const stored = locator("publication.pdf", 2)
    const positions = [
      locator("native-publication.pdf?page=1", 1),
      locator("native-publication.pdf?page=2", 2),
    ]

    expect(
      resolveReaderBookmarkNavigationLocator(stored, positions, "fixed"),
    ).toBe(positions[1])
  })

  it("should keep the stored fixed-layout locator when positions are unavailable", () => {
    const stored = locator("page-2.jpg", 2)

    expect(resolveReaderBookmarkNavigationLocator(stored, [], "fixed")).toBe(
      stored,
    )
  })
})
