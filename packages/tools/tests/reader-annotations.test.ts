import { describe, expect, it } from "vitest"
import {
  canonicalizeReaderAnnotationLocator,
  readerAnnotationExcerpt,
  readerAnnotationMatchesSelection,
  sortReaderAnnotations,
} from "../src/reader-annotations"

describe("reader annotations", () => {
  it("should preserve text context when canonicalizing an annotation locator", () => {
    const locator = canonicalizeReaderAnnotationLocator({
      href: "file:///tmp/extracted/book/OEBPS/chapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        progression: 0.25,
        cssSelector: "#paragraph",
      },
      text: {
        before: "before ",
        highlight: "selected text",
        after: " after",
      },
    })

    expect(locator.href).toBe("OEBPS/chapter.xhtml")
    expect(locator.locations?.cssSelector).toBe("#paragraph")
    expect(locator.text).toEqual({
      before: "before ",
      highlight: "selected text",
      after: " after",
    })
    expect(readerAnnotationExcerpt(locator)).toBe("selected text")
  })

  it("should sort annotations in publication order", () => {
    const annotations = sortReaderAnnotations([
      {
        id: "later",
        createdAt: 2,
        locator: {
          href: "b.xhtml",
          type: "application/xhtml+xml",
          locations: { progression: 0, position: 2 },
        },
      },
      {
        id: "earlier",
        createdAt: 1,
        locator: {
          href: "a.xhtml",
          type: "application/xhtml+xml",
          locations: { progression: 0, position: 1 },
        },
      },
    ])

    expect(annotations.map((annotation) => annotation.id)).toEqual([
      "earlier",
      "later",
    ])
  })

  it("should match the same selected passage after locator canonicalization", () => {
    const saved = {
      href: "OEBPS/chapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        progression: 0.25,
        cssSelector: "#paragraph",
      },
      text: {
        before: " before ",
        highlight: " selected text ",
        after: " after ",
      },
    }
    const selected = {
      ...saved,
      href: "file:///tmp/extracted/book/OEBPS/chapter.xhtml",
    }

    expect(readerAnnotationMatchesSelection(saved, selected)).toBe(true)
    expect(
      readerAnnotationMatchesSelection(saved, {
        ...selected,
        locations: { progression: 0.25, cssSelector: "#other" },
      }),
    ).toBe(false)
  })
})
