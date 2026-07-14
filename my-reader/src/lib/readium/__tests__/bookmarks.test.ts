import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { Locator, LocatorLocations, LocatorText } from "@readium/shared"
import { describe, expect, it } from "vitest"
import {
  deserializeReaderBookmarkLocator,
  divinaPageForBookmark,
  pdfPageForBookmark,
  serializeReaderBookmarkLocator,
} from "../bookmarks"

describe("reader bookmark locators", () => {
  it("should preserve extension locations when Readium Locator is serialized", () => {
    const locator = new Locator({
      href: "asset://localhost/extracted/book-id/Text/章节 一.xhtml#段落",
      type: "application/xhtml+xml",
      title: "章节 一",
      locations: new LocatorLocations({
        fragments: ["existing"],
        progression: 0.4,
        position: 12,
        otherLocations: new Map<string, unknown>([
          ["cssSelector", "#chapter > p:nth-child(2)"],
          ["domRange", { start: 4, end: 9 }],
        ]),
      }),
      text: new LocatorText({
        before: "前文",
        highlight: "正文",
        after: "后文",
      }),
    })

    const stored = serializeReaderBookmarkLocator(locator, "EPUB")

    expect(stored.href).toBe("Text/%E7%AB%A0%E8%8A%82%20%E4%B8%80.xhtml")
    expect(stored.locations?.fragments).toEqual(["段落", "existing"])
    expect(stored.locations).toMatchObject({
      cssSelector: "#chapter > p:nth-child(2)",
      domRange: { start: 4, end: 9 },
    })
    expect(stored.text).toEqual({
      before: "前文",
      highlight: "正文",
      after: "后文",
    })

    const restored = deserializeReaderBookmarkLocator(stored)
    expect(restored?.locations.otherLocations?.get("cssSelector")).toBe(
      "#chapter > p:nth-child(2)",
    )
  })

  it("should replace process-local PDF href when locator is stored", () => {
    const locator = new Locator({
      href: "/Users/me/Library/Book.pdf",
      type: "application/pdf",
      locations: new LocatorLocations({
        fragments: ["page=8"],
        position: 8,
      }),
    })

    expect(serializeReaderBookmarkLocator(locator, "PDF").href).toBe(
      "publication.pdf",
    )
  })

  it("should resolve PDF bookmark page directly from stored position", () => {
    const bookmark: ReaderLocator = {
      href: "publication.pdf",
      type: "application/pdf",
      locations: { fragments: ["page=2"], progression: 0.7, position: 8 },
    }

    expect(pdfPageForBookmark(bookmark, 10)).toBe(8)
    expect(pdfPageForBookmark(bookmark, 7)).toBeNull()
  })

  it("should prefer canonical href when CBZ position differs across devices", () => {
    const positions = [
      new Locator({
        href: "asset://localhost/extracted/runtime-a/pages/001.jpg",
        type: "image/jpeg",
        locations: new LocatorLocations({ position: 1 }),
      }),
      new Locator({
        href: "asset://localhost/extracted/runtime-a/pages/002.jpg",
        type: "image/jpeg",
        locations: new LocatorLocations({ position: 2 }),
      }),
    ]
    const bookmark: ReaderLocator = {
      href: "pages/002.jpg",
      type: "image/jpeg",
      locations: { progression: 0, position: 1 },
    }

    expect(divinaPageForBookmark(bookmark, positions)).toBe(2)
  })
})
