import { describe, expect, it } from "vitest"
import {
  canonicalizeReaderLocatorForStorage,
  readerBookmarkLocatorKey,
  sameReaderBookmarkLocation,
  sortReaderBookmarks,
} from "../src/reader-bookmarks"
import type { ReaderLocator } from "../src/reader-toc"

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

describe("reader bookmark locator utilities", () => {
  it("should move an href fragment into locations when canonicalizing", () => {
    const input = locator("OPS/chapter.xhtml#section-2", {
      fragments: ["section-1", "section-2"],
    })

    expect(canonicalizeReaderLocatorForStorage(input)).toEqual({
      ...input,
      href: "OPS/chapter.xhtml",
      locations: {
        progression: 0,
        fragments: ["section-2", "section-1"],
      },
    })
    expect(input.href).toBe("OPS/chapter.xhtml#section-2")
  })

  it("should preserve percent encoding when stripping an asset cache prefix", () => {
    const input = locator(
      "asset://localhost/%2Fvar%2Ftmp%2Fmyreader%2Fextracted%2Flib-1-EPUB%2FOPS%2Fchapter%20one.xhtml#part",
    )

    expect(canonicalizeReaderLocatorForStorage(input)).toMatchObject({
      href: "OPS/chapter%20one.xhtml",
      locations: { fragments: ["part"] },
    })
  })

  it.each([
    "http",
    "https",
  ])("should strip a Windows Tauri asset origin when using %s", (protocol) => {
    const input = locator(
      `${protocol}://asset.localhost/%2FC%3A%2FUsers%2Fwen%2FAppData%2FLocal%2FMyReader%2Fextracted%2Fruntime-id%2Fpages%2F001.jpg`,
      { position: 1 },
    )

    expect(canonicalizeReaderLocatorForStorage(input).href).toBe(
      "pages/001.jpg",
    )
  })

  it("should strip a file origin when canonicalizing a standalone PDF locator", () => {
    const input = locator("file:///Users/wen/Books/%E4%B9%A6%E5%90%8D.pdf", {
      position: 3,
    })

    expect(
      canonicalizeReaderLocatorForStorage({ ...input, type: "application/pdf" })
        .href,
    ).toBe("publication.pdf")
  })

  it("should match a PDF page when platform file hrefs differ", () => {
    const desktop = {
      ...locator("publication.pdf", { position: 8 }),
      type: "application/pdf",
    }
    const mobile = {
      ...locator("file:///Users/wen/Books/%E4%B9%A6%E5%90%8D.pdf", {
        position: 8,
      }),
      type: "application/pdf",
    }

    expect(canonicalizeReaderLocatorForStorage(mobile).href).toBe(
      "publication.pdf",
    )
    expect(readerBookmarkLocatorKey(desktop)).toBe(
      readerBookmarkLocatorKey(mobile),
    )
  })

  it("should preserve flat Readium location extensions when canonicalizing", () => {
    const input = locator("OPS/chapter.xhtml#section", {
      cssSelector: "#section > p:nth-child(2)",
      partialCfi: "/4/2/6",
      domRange: {
        start: { cssSelector: "#section", textNodeIndex: 0, charOffset: 4 },
        end: { cssSelector: "#section", textNodeIndex: 0, charOffset: 12 },
      },
    })

    expect(canonicalizeReaderLocatorForStorage(input).locations).toEqual({
      progression: 0,
      fragments: ["section"],
      cssSelector: "#section > p:nth-child(2)",
      partialCfi: "/4/2/6",
      domRange: {
        start: { cssSelector: "#section", textNodeIndex: 0, charOffset: 4 },
        end: { cssSelector: "#section", textNodeIndex: 0, charOffset: 12 },
      },
    })
  })

  it("should flatten a Readium otherLocations map when canonicalizing for storage", () => {
    const input = locator("OPS/chapter.xhtml", {
      otherLocations: new Map<string, unknown>([
        ["cssSelector", "#chapter"],
        ["partialCfi", "/4/2"],
      ]),
    })

    const result = canonicalizeReaderLocatorForStorage(input)

    expect(result.locations).toEqual({
      progression: 0,
      cssSelector: "#chapter",
      partialCfi: "/4/2",
    })
    expect(JSON.stringify(result)).not.toContain("otherLocations")
  })

  it("should produce the same identity when canonical locations match", () => {
    const desktop = locator(
      "asset://localhost/%2Ftmp%2Fextracted%2Fbook%2Fpage-2.jpg",
      { position: 2, progression: 0.5 },
    )
    const mobile = locator("page-2.jpg", {
      position: 2,
      progression: 0.5,
    })

    expect(readerBookmarkLocatorKey(desktop)).toMatch(/^v3:[0-9a-f]{32}$/)
    expect(sameReaderBookmarkLocation(desktop, mobile)).toBe(true)
  })

  it("should distinguish precise EPUB anchors when a coarse position matches", () => {
    const first = locator("OPS/chapter.xhtml", {
      position: 2,
      progression: 0.5,
      cssSelector: "#first",
    })
    const second = locator("OPS/chapter.xhtml", {
      position: 2,
      progression: 0.5,
      cssSelector: "#second",
    })

    expect(readerBookmarkLocatorKey(first)).not.toBe(
      readerBookmarkLocatorKey(second),
    )
  })

  it("should keep identity stable when progression changes for the same anchor", () => {
    const first = locator("OPS/chapter.xhtml", {
      position: 2,
      progression: 0.4,
      totalProgression: 0.2,
      cssSelector: "#paragraph",
    })
    const second = locator("OPS/chapter.xhtml", {
      position: 3,
      progression: 0.6,
      totalProgression: 0.21,
      cssSelector: "#paragraph",
    })

    expect(readerBookmarkLocatorKey(first)).toBe(
      readerBookmarkLocatorKey(second),
    )
  })

  it("should prefer the center DOM range when other anchors differ", () => {
    const first = locator("OPS/chapter.xhtml", {
      partialCfi: "/4/2/6",
      cssSelector: "#first",
      domRange: {
        start: { cssSelector: "#center", textNodeIndex: 0, charOffset: 12 },
      },
      progression: 0.4,
    })
    const second = locator("OPS/chapter.xhtml", {
      partialCfi: "/4/2/8",
      cssSelector: "#second",
      domRange: {
        start: { cssSelector: "#center", textNodeIndex: 0, charOffset: 12 },
      },
      progression: 0.6,
    })

    expect(readerBookmarkLocatorKey(first)).toBe(
      readerBookmarkLocatorKey(second),
    )
  })

  it("should keep identity stable when extension object keys are reordered", () => {
    const first = locator("OPS/chapter.xhtml", {
      position: 2,
      domRange: { start: 4, end: 9 },
    })
    const second = locator("OPS/chapter.xhtml", {
      domRange: { end: 9, start: 4 },
      position: 2,
    })

    expect(readerBookmarkLocatorKey(first)).toBe(
      readerBookmarkLocatorKey(second),
    )
  })

  it("should distinguish fallback keys when fragments differ", () => {
    const first = locator("OPS/chapter.xhtml#first", { progression: 0.25 })
    const second = locator("OPS/chapter.xhtml#second", { progression: 0.25 })

    expect(readerBookmarkLocatorKey(first)).not.toBe(
      readerBookmarkLocatorKey(second),
    )
  })

  it("should return a stable reading-order copy when sorting bookmarks", () => {
    const input = [
      { id: "c", createdAt: 3, locator: locator("c", { position: 3 }) },
      { id: "b", createdAt: 2, locator: locator("b", { position: 1 }) },
      { id: "a", createdAt: 1, locator: locator("a", { position: 1 }) },
    ]

    const result = sortReaderBookmarks(input)

    expect(result.map((bookmark) => bookmark.id)).toEqual(["a", "b", "c"])
    expect(input.map((bookmark) => bookmark.id)).toEqual(["c", "b", "a"])
  })
})
