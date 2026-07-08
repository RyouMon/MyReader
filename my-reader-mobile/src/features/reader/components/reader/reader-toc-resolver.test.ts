import type { ReaderTocItem } from "@/src/features/reader/components/reader/types"
import type { Locator } from "@my-reader/readium"

import {
  fragmentFromHref,
  hasFragment,
  hrefRoughlyMatches,
  locatorWithHrefFragments,
  positionIndexForLocator,
  resolveReaderToc,
  stripFragment,
} from "./reader-toc-resolver"

function locator(
  href: string,
  locations: Partial<NonNullable<Locator["locations"]>> = {},
): Locator {
  return {
    href,
    type: "application/xhtml+xml",
    locations,
  } as Locator
}

function tocItemWithLocator(
  label: string,
  href: string,
  itemLocator?: Locator,
  depth = 0,
): ReaderTocItem {
  return {
    id: label,
    label,
    pageIndex: 0,
    depth,
    href,
    locator: itemLocator,
  }
}

function tocItem(
  label: string,
  href: string,
  position?: number,
  depth = 0,
): ReaderTocItem {
  return tocItemWithLocator(
    label,
    href,
    position == null ? undefined : locator(href, { progression: 0, position }),
    depth,
  )
}

function tocItemWithoutDepth(
  label: string,
  href: string,
  position?: number,
): ReaderTocItem {
  return {
    ...tocItem(label, href, position),
    depth: undefined,
  }
}

function resolveIndex(
  toc: ReaderTocItem[],
  currentHref: string | null,
  currentPage?: number | null,
  currentTitle?: string | null,
): number {
  return resolveReaderToc({
    toc,
    currentHref,
    currentPage,
    currentTitle,
  }).index
}

describe("reader toc resolver", () => {
  it("should match href when fragments or prefixes differ", () => {
    expect(hrefRoughlyMatches("OPS/chapter.xhtml#p1", "chapter.xhtml")).toBe(
      true,
    )
  })

  it("should not roughly match empty hrefs", () => {
    expect(hrefRoughlyMatches("", "chapter.xhtml")).toBe(false)
    expect(hrefRoughlyMatches("chapter.xhtml", "")).toBe(false)
    expect(hrefRoughlyMatches("chapter.xhtml", "other.xhtml")).toBe(false)
  })

  it("should parse href fragments", () => {
    expect(stripFragment("chapter.xhtml#part-1")).toBe("chapter.xhtml")
    expect(stripFragment("chapter.xhtml")).toBe("chapter.xhtml")
    expect(fragmentFromHref("chapter.xhtml#part-1")).toBe("part-1")
    expect(fragmentFromHref("chapter.xhtml")).toBeUndefined()
    expect(fragmentFromHref(undefined)).toBeUndefined()
    expect(hasFragment("chapter.xhtml#part-1")).toBe(true)
    expect(hasFragment("chapter.xhtml")).toBe(false)
    expect(hasFragment(undefined)).toBe(false)
  })

  it("should keep locator href when it already includes a fragment", () => {
    const current = locator("chapter.xhtml#part-1", {
      fragments: ["part-2"],
    })

    expect(locatorWithHrefFragments(current)).toBe(current)
  })

  it("should append locator fragments to hrefs", () => {
    expect(
      locatorWithHrefFragments(
        locator("chapter.xhtml", { fragments: ["#part-2"] }),
      ).href,
    ).toBe("chapter.xhtml#part-2")
    expect(
      locatorWithHrefFragments(
        locator("chapter.xhtml", { fragments: ["part-3"] }),
      ).href,
    ).toBe("chapter.xhtml#part-3")
  })

  it("should keep locator href when fragments are unavailable", () => {
    const withoutFragments = locator("chapter.xhtml")
    const emptyFragments = locator("chapter.xhtml", { fragments: [""] })
    const hashOnlyFragment = locator("chapter.xhtml", { fragments: ["#"] })

    expect(locatorWithHrefFragments(withoutFragments)).toBe(withoutFragments)
    expect(locatorWithHrefFragments(emptyFragments)).toBe(emptyFragments)
    expect(locatorWithHrefFragments(hashOnlyFragment)).toBe(hashOnlyFragment)
  })

  it("should resolve position index from native position", () => {
    expect(
      positionIndexForLocator(
        undefined,
        locator("chapter.xhtml", { position: 3 }),
      ),
    ).toBe(2)
  })

  it("should clamp native position to available positions", () => {
    const positions = [locator("intro.xhtml"), locator("chapter.xhtml")]

    expect(
      positionIndexForLocator(
        positions,
        locator("chapter.xhtml", { position: 20 }),
      ),
    ).toBe(1)
  })

  it("should resolve position index from locator href", () => {
    const positions = [locator("intro.xhtml"), locator("chapter.xhtml")]

    expect(
      positionIndexForLocator(positions, locator("OPS/chapter.xhtml")),
    ).toBe(1)
  })

  it("should resolve position index from progression", () => {
    const positions = [
      locator("intro.xhtml"),
      locator("chapter.xhtml"),
      locator("appendix.xhtml"),
    ]

    expect(
      positionIndexForLocator(
        positions,
        locator("missing.xhtml", { totalProgression: 0.5 }),
      ),
    ).toBe(1)
    expect(
      positionIndexForLocator(
        positions,
        locator("missing.xhtml", { progression: 0.9, position: 0 }),
      ),
    ).toBe(2)
  })

  it("should use the first page when position data cannot resolve an index", () => {
    expect(positionIndexForLocator([], locator("missing.xhtml"))).toBe(0)
    expect(
      positionIndexForLocator(
        [locator("intro.xhtml"), locator("chapter.xhtml")],
        locator("missing.xhtml", { progression: Number.NaN }),
      ),
    ).toBe(0)
  })

  it("should return fallback title when toc is empty", () => {
    expect(
      resolveReaderToc({
        toc: [],
        fallbackTitle: "  Missing Chapter  ",
      }),
    ).toMatchObject({
      index: -1,
      item: null,
      title: "Missing Chapter",
      reason: "fallback",
    })
  })

  it("should return none when toc and fallback title are empty", () => {
    expect(resolveReaderToc({ toc: [], fallbackTitle: " " })).toMatchObject({
      index: -1,
      item: null,
      title: null,
      reason: "none",
    })
  })

  it("should use current title as empty toc fallback", () => {
    expect(
      resolveReaderToc({
        toc: [],
        currentTitle: "Current Chapter",
      }),
    ).toMatchObject({
      index: -1,
      title: "Current Chapter",
      reason: "fallback",
    })
  })

  it("should return none when empty toc has no fallback text", () => {
    expect(resolveReaderToc({ toc: [] })).toMatchObject({
      index: -1,
      title: null,
      reason: "none",
    })
  })

  it("should use selected toc item when it still represents the href", () => {
    const toc = [
      tocItem("Chapter 8", "chapter-8.xhtml", 80),
      tocItem("Section 8.1", "chapter-8.xhtml#section-1", 81, 1),
    ]

    expect(
      resolveReaderToc({
        toc,
        currentHref: "OPS/chapter-8.xhtml",
        selectedTocItem: toc[1],
      }),
    ).toMatchObject({
      index: 1,
      reason: "selected",
    })
  })

  it("should use selected toc item when href context is unavailable", () => {
    const toc = [tocItem("Chapter", "chapter.xhtml")]

    expect(
      resolveReaderToc({
        toc,
        selectedTocItem: toc[0],
      }),
    ).toMatchObject({
      index: 0,
      reason: "selected",
    })
  })

  it("should use selected toc item without href", () => {
    const selected = {
      ...tocItem("Loose Entry", "loose.xhtml"),
      href: undefined,
    }

    expect(
      resolveReaderToc({
        toc: [selected],
        currentHref: "chapter.xhtml",
        selectedTocItem: selected,
      }),
    ).toMatchObject({
      index: 0,
      reason: "selected",
    })
  })

  it("should ignore selected toc item from another resource", () => {
    const toc = [
      tocItem("Chapter 8", "chapter-8.xhtml", 80),
      tocItem("Section 8.1", "chapter-8.xhtml#section-1", 81, 1),
    ]

    expect(
      resolveReaderToc({
        toc,
        currentHref: "chapter-9.xhtml",
        currentPage: 89,
        selectedTocItem: toc[1],
      }),
    ).not.toMatchObject({
      index: 1,
      reason: "selected",
    })
  })

  it("should ignore selected toc item that is not in the toc", () => {
    const toc = [tocItem("Chapter 8", "chapter-8.xhtml", 80)]

    expect(
      resolveReaderToc({
        toc,
        currentHref: "chapter-8.xhtml",
        currentPage: 79,
        selectedTocItem: tocItem("External", "chapter-8.xhtml", 80),
      }),
    ).toMatchObject({
      index: 0,
      reason: "exact-position",
    })
  })

  it("should ignore empty hrefs when checking exact matches", () => {
    expect(
      resolveReaderToc({
        toc: [tocItem("Empty", "")],
        currentHref: "",
      }),
    ).toMatchObject({
      index: -1,
      reason: "none",
    })
  })

  it("should find nearest previous toc item when current page is inside a chapter", () => {
    const toc = [
      tocItem("Intro", "intro.xhtml", 1),
      tocItem("Chapter 1", "chapter-1.xhtml", 8),
      tocItem("Chapter 2", "chapter-2.xhtml", 18),
    ]

    expect(resolveIndex(toc, "chapter-1.xhtml", 12)).toBe(1)
  })

  it("should prefer exact parent href over child rough matches", () => {
    const toc = [
      tocItem("Part", "part.xhtml", 1),
      tocItem("Chapter", "part.xhtml#chapter", 1, 1),
    ]

    expect(resolveIndex(toc, "part.xhtml", 0)).toBe(0)
  })

  it("should use toc positions when current href has no fragment", () => {
    const toc = [
      tocItem("Chapter 8", "chapter-8.xhtml", 8),
      tocItem("Section 8.1", "chapter-8.xhtml#section-1", 9),
      tocItem("Section 8.2", "chapter-8.xhtml#section-2", 10),
    ]

    expect(resolveIndex(toc, "OPS/chapter-8.xhtml", 11)).toBe(2)
  })

  it("should prefer parent document item when current page is unavailable", () => {
    const toc = [
      tocItem("Chapter 8", "chapter-8.xhtml", 8),
      tocItem("Section 8.1", "chapter-8.xhtml#section-1", 9),
      tocItem("Section 8.2", "chapter-8.xhtml#section-2", 10),
    ]

    expect(resolveIndex(toc, "OPS/chapter-8.xhtml", null)).toBe(0)
  })

  it("should prefer exact child href when current href includes fragment", () => {
    const toc = [
      tocItem("Chapter 8", "chapter-8.xhtml", 8),
      tocItem("Section 8.1", "chapter-8.xhtml#section-1", 9),
      tocItem("Section 8.2", "chapter-8.xhtml#section-2", 10),
    ]

    expect(resolveIndex(toc, "OPS/chapter-8.xhtml#section-2", 11)).toBe(2)
  })

  it("should prefer a child chapter when a toc container shares its exact href", () => {
    const toc = [
      tocItem("Alice's Adventures in Wonderland", "Text/chapter1.xhtml", 10),
      tocItem("Chapter I. Down the Rabbit-Hole", "Text/chapter1.xhtml", 10, 1),
      tocItem("Chapter II. The Pool of Tears", "Text/chapter2.xhtml", 22, 1),
    ]
    const positions = Array.from({ length: 30 }, (_, index) =>
      locator(
        index < 9 ? "OEBPS/Text/contents.xhtml" : "OEBPS/Text/chapter1.xhtml",
        {
          position: index + 1,
        },
      ),
    )

    expect(
      resolveReaderToc({
        toc,
        positions,
        locator: locator("OEBPS/Text/chapter1.xhtml", { position: 10 }),
      }),
    ).toMatchObject({
      index: 1,
      reason: "exact-position",
    })
  })

  it("should prefer the later exact href when depth is undefined", () => {
    const toc = [
      tocItemWithoutDepth(
        "Alice's Adventures in Wonderland",
        "Text/chapter1.xhtml",
        10,
      ),
      tocItemWithoutDepth(
        "Chapter I. Down the Rabbit-Hole",
        "Text/chapter1.xhtml",
        10,
      ),
    ]

    expect(
      resolveReaderToc({
        toc,
        currentHref: "OEBPS/Text/chapter1.xhtml",
      }),
    ).toMatchObject({
      index: 1,
      reason: "exact-fragment",
    })
  })

  it("should ignore future exact fragment before that toc position starts", () => {
    const toc = [
      tocItem("8.8 The Chapel", "text00018.html#bw88", 149, 1),
      tocItem("8.9 The Pulpit", "text00018.html#bw89", 151, 1),
      tocItem("8.10 The Sermon", "text00018.html#bw90", 152, 1),
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("OEBPS/text00018.html#bw90", { position: 151 }),
      }),
    ).toMatchObject({
      index: 1,
      reason: "closest-before",
    })
  })

  it("should prefer current title when href only identifies the parent resource", () => {
    const toc = [
      tocItem("Chapter 2", "text00010.html", 47),
      tocItem("2.7 The Carpet-Bag", "text00010.html#bw12", 50, 1),
      tocItem("2.8 The Spouter-Inn", "text00010.html#bw13", 53, 1),
    ]

    expect(
      resolveIndex(toc, "OEBPS/text00010.html", 52, "2.8 The Spouter-Inn"),
    ).toBe(2)
  })

  it("should keep current same-resource subchapter when next starts on the following page", () => {
    const toc = [
      tocItem("Chapter 6", "text00014.html", 103),
      tocItem("6.5 Breakfast", "text00014.html#bw46", 111, 1),
      tocItem("6.6 The Street", "text00014.html#bw47", 113, 1),
    ]

    expect(resolveIndex(toc, "OEBPS/text00014.html", 111)).toBe(1)
    expect(
      resolveIndex(toc, "OEBPS/text00014.html", 111, "6.6 The Street"),
    ).toBe(1)
  })

  it("should not use next same-resource subchapter two pages early", () => {
    const toc = [
      tocItem("Chapter 6", "text00014.html", 103),
      tocItem("6.5 Breakfast", "text00014.html#bw46", 111, 1),
      tocItem("6.6 The Street", "text00014.html#bw47", 113, 1),
    ]

    expect(resolveIndex(toc, "OEBPS/text00014.html", 110)).toBe(1)
  })

  it("should ignore stale current title when page has advanced into the next toc item", () => {
    const toc = [
      tocItem("Volume I", "text/part0004.html", 1),
      tocItem("Chapter 1", "text/part0005.html", 13),
    ]

    expect(resolveIndex(toc, "text/part0004.html", 12, "Volume I")).toBe(1)
  })

  it("should keep page outline matching position-based when href has page links", () => {
    const toc = [
      tocItem("Page 1", "book.pdf#page=1", 1),
      tocItem("Page 8", "book.pdf#page=8", 8),
    ]

    expect(resolveIndex(toc, "book.pdf", 7)).toBe(1)
  })

  it("should prefer the deeper toc item when repeated positions tie", () => {
    const toc = [
      tocItem("Part", "part.xhtml", 1),
      tocItem("Chapter", "part.xhtml#chapter", 1, 1),
    ]

    expect(resolveIndex(toc, "missing.xhtml", 0)).toBe(1)
  })

  it("should prefer the later toc item when repeated positions and depth tie", () => {
    const toc = [
      tocItem("Section A", "part.xhtml#a", 1, 1),
      tocItem("Section B", "part.xhtml#b", 1, 1),
    ]

    expect(resolveIndex(toc, "missing.xhtml", 0)).toBe(1)
  })

  it("should prefer later closest item when depth is undefined", () => {
    const toc = [
      tocItemWithoutDepth("Section A", "part.xhtml#a", 1),
      tocItemWithoutDepth("Section B", "part.xhtml#b", 1),
    ]

    expect(resolveIndex(toc, "missing.xhtml", 0)).toBe(1)
  })

  it("should use current position resource when locator href is stale", () => {
    const toc = [
      tocItem("Chapter 1", "chapter-1.xhtml", 1),
      tocItem("Chapter 2", "chapter-2.xhtml", 2),
    ]
    const positions = [
      locator("chapter-1.xhtml", { position: 1 }),
      locator("chapter-2.xhtml", { position: 2 }),
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("chapter-1.xhtml", { position: 2 }),
        positions,
      }),
    ).toMatchObject({
      index: 1,
      reason: "resource-position",
    })
  })

  it("should resolve toc item positions from the positions list", () => {
    const toc = [tocItemWithLocator("Chapter", "chapter.xhtml")]
    const positions = [locator("chapter.xhtml", { position: 1 })]

    expect(
      resolveReaderToc({
        toc,
        currentHref: "OPS/chapter.xhtml",
        currentPage: 0,
        positions,
      }),
    ).toMatchObject({
      index: 0,
      reason: "exact-position",
    })
  })

  it("should keep parent title at resource start before nested progressions start", () => {
    const toc = [
      tocItemWithLocator(
        "Chapter 5",
        "chapter-5.xhtml",
        locator("chapter-5.xhtml", { progression: 0.01, position: 1 }),
      ),
      tocItemWithLocator(
        "Section 5.1",
        "chapter-5.xhtml#section-1",
        locator("chapter-5.xhtml#section-1", {
          progression: 0.4,
          position: 3,
        }),
        1,
      ),
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("chapter-5.xhtml", {
          progression: 0.05,
          position: 2,
        }),
      }),
    ).toMatchObject({
      index: 0,
      reason: "resource-start",
    })
  })

  it("should keep parent title at resource start when progression is unavailable", () => {
    const toc = [
      tocItem("Chapter 5", "chapter-5.xhtml", 1),
      tocItem("Section 5.1", "chapter-5.xhtml#section-1", 3, 1),
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("chapter-5.xhtml", { position: 2 }),
      }),
    ).toMatchObject({
      index: 0,
      reason: "resource-start",
    })
  })

  it("should keep the closest started nested item after the progression halfway point", () => {
    const toc = [
      tocItemWithLocator(
        "Chapter 6",
        "chapter-6.xhtml",
        locator("chapter-6.xhtml", { progression: 0.1, position: 100 }),
      ),
      tocItemWithLocator(
        "Section 6.5",
        "chapter-6.xhtml#section-5",
        locator("chapter-6.xhtml#section-5", {
          fragments: ["section-5"],
          progression: 0.52,
          position: 110,
        }),
        1,
      ),
      tocItemWithLocator(
        "Section 6.6",
        "chapter-6.xhtml#section-6",
        locator("chapter-6.xhtml#section-6", {
          fragments: ["section-6"],
          progression: 0.6,
          position: 114,
        }),
        1,
      ),
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("chapter-6.xhtml", { progression: 0.57 }),
      }),
    ).toMatchObject({
      index: 1,
      reason: "progression",
    })
  })

  it("should keep the closest progression before the estimated halfway point", () => {
    const toc = [
      tocItemWithLocator(
        "Section 6.5",
        "chapter-6.xhtml#section-5",
        locator("chapter-6.xhtml#section-5", {
          fragments: ["section-5"],
          progression: 0.52,
        }),
        1,
      ),
      tocItemWithLocator(
        "Section 6.6",
        "chapter-6.xhtml#section-6",
        locator("chapter-6.xhtml#section-6", {
          fragments: ["section-6"],
          progression: 0.6,
        }),
        1,
      ),
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("chapter-6.xhtml", { progression: 0.54 }),
      }),
    ).toMatchObject({
      index: 0,
      reason: "progression",
    })
  })

  it("should not promote to the next same-resource section before its progression starts", () => {
    const toc = [
      tocItemWithLocator(
        "Chapter 8",
        "text00018.html",
        locator("text00018.html", { progression: 0.2, position: 130 }),
      ),
      tocItemWithLocator(
        "8.9 The Pulpit",
        "text00018.html#bw89",
        locator("text00018.html#bw89", {
          fragments: ["bw89"],
          progression: 0.62,
          position: 151,
        }),
        1,
      ),
      tocItemWithLocator(
        "8.10 The Sermon",
        "text00018.html#bw90",
        locator("text00018.html#bw90", {
          fragments: ["bw90"],
          progression: 0.68,
          position: 152,
        }),
        1,
      ),
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("OEBPS/text00018.html", {
          progression: 0.64,
          position: 151,
        }),
      }),
    ).toMatchObject({
      index: 1,
      reason: "progression",
    })
  })

  it("should use the closest same-resource progression item", () => {
    const toc = [
      tocItemWithLocator(
        "Section 6.4",
        "chapter-6.xhtml#section-4",
        locator("chapter-6.xhtml#section-4", { progression: 0.4 }),
        1,
      ),
      tocItemWithLocator(
        "Section 6.5",
        "chapter-6.xhtml#section-5",
        locator("chapter-6.xhtml#section-5", { progression: 0.5 }),
        1,
      ),
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("chapter-6.xhtml", { progression: 0.51 }),
      }),
    ).toMatchObject({
      index: 1,
      reason: "progression",
    })
  })

  it("should prefer deeper progression item when starts tie", () => {
    const toc = [
      tocItemWithLocator(
        "Section 6.5",
        "chapter-6.xhtml#section-5",
        locator("chapter-6.xhtml#section-5", { progression: 0.4 }),
        1,
      ),
      tocItemWithLocator(
        "Nested Detail",
        "chapter-6.xhtml#detail",
        locator("chapter-6.xhtml#detail", { progression: 0.4 }),
        2,
      ),
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("chapter-6.xhtml", { progression: 0.45 }),
      }),
    ).toMatchObject({
      index: 1,
      reason: "progression",
    })
  })

  it("should prefer later progression item when starts and depth tie", () => {
    const toc = [
      tocItemWithLocator(
        "Section 6.5",
        "chapter-6.xhtml#section-5",
        locator("chapter-6.xhtml#section-5", { progression: 0.4 }),
        1,
      ),
      tocItemWithLocator(
        "Section 6.6",
        "chapter-6.xhtml#section-6",
        locator("chapter-6.xhtml#section-6", { progression: 0.4 }),
        1,
      ),
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("chapter-6.xhtml", { progression: 0.45 }),
      }),
    ).toMatchObject({
      index: 1,
      reason: "progression",
    })
  })

  it("should prefer later progression item when starts tie and depth is undefined", () => {
    const toc = [
      {
        ...tocItemWithLocator(
          "Section 6.5",
          "chapter-6.xhtml#section-5",
          locator("chapter-6.xhtml#section-5", { progression: 0.4 }),
        ),
        depth: undefined,
      },
      {
        ...tocItemWithLocator(
          "Section 6.6",
          "chapter-6.xhtml#section-6",
          locator("chapter-6.xhtml#section-6", { progression: 0.4 }),
        ),
        depth: undefined,
      },
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("chapter-6.xhtml", { progression: 0.45 }),
      }),
    ).toMatchObject({
      index: 1,
      reason: "progression",
    })
  })

  it("should fall through when no same-resource progression item is available", () => {
    const toc = [
      tocItemWithLocator(
        "Other",
        "other.xhtml#section",
        locator("other.xhtml#section", { progression: 0.2 }),
      ),
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("chapter-6.xhtml", { progression: 0.45 }),
      }),
    ).toMatchObject({
      index: -1,
      reason: "none",
    })
  })

  it("should use closest progression when only one fragment item exists", () => {
    const toc = [
      tocItemWithLocator(
        "Section 6.5",
        "chapter-6.xhtml#section-5",
        locator("chapter-6.xhtml#section-5", { progression: 0.4 }),
      ),
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("chapter-6.xhtml", { progression: 0.45 }),
      }),
    ).toMatchObject({
      index: 0,
      reason: "progression",
    })
  })

  it("should use the closest progression even when it is the parent item", () => {
    const toc = [
      tocItemWithLocator(
        "Chapter 6",
        "chapter-6.xhtml",
        locator("chapter-6.xhtml", { progression: 0.24 }),
      ),
      tocItemWithLocator(
        "Section 6.5",
        "chapter-6.xhtml#section-5",
        locator("chapter-6.xhtml#section-5", { progression: 0.2 }),
        1,
      ),
      tocItemWithLocator(
        "Section 6.6",
        "chapter-6.xhtml#section-6",
        locator("chapter-6.xhtml#section-6", { progression: 0.7 }),
        1,
      ),
    ]

    expect(
      resolveReaderToc({
        toc,
        locator: locator("chapter-6.xhtml", { progression: 0.25 }),
      }),
    ).toMatchObject({
      index: 0,
      reason: "progression",
    })
  })

  it("should use href fallback when only stripped resource names match", () => {
    const toc = [tocItem("Known Fragment", "chapter.xhtml#known", 1)]

    expect(
      resolveReaderToc({
        toc,
        currentHref: "OPS/chapter.xhtml#other",
      }),
    ).toMatchObject({
      index: 0,
      reason: "href",
    })
  })

  it("should return fallback title when no toc item matches", () => {
    const toc = [tocItem("Chapter", "chapter.xhtml", 1)]

    expect(
      resolveReaderToc({
        toc,
        currentHref: "missing.xhtml",
        fallbackTitle: "  Unknown  ",
      }),
    ).toMatchObject({
      index: -1,
      title: "Unknown",
      reason: "fallback",
    })
  })

  it("should return none when no toc item and no fallback title match", () => {
    const toc = [tocItem("Chapter", "chapter.xhtml", 1)]

    expect(
      resolveReaderToc({
        toc,
        currentHref: "missing.xhtml",
      }),
    ).toMatchObject({
      index: -1,
      title: null,
      reason: "none",
    })
  })

  it("should return none when href context is unavailable", () => {
    expect(
      resolveReaderToc({
        toc: [tocItem("Chapter", "chapter.xhtml")],
      }),
    ).toMatchObject({
      index: -1,
      reason: "none",
    })
  })

  it("should ignore toc items without locators during page matching", () => {
    expect(
      resolveReaderToc({
        toc: [tocItemWithLocator("Chapter", "chapter.xhtml")],
        currentHref: "missing.xhtml",
        currentPage: 5,
      }),
    ).toMatchObject({
      index: -1,
      reason: "none",
    })
  })

  it("should ignore blank current title", () => {
    const toc = [
      tocItem("Chapter", "chapter.xhtml", 1),
      tocItem("Section", "chapter.xhtml#section", 10, 1),
    ]

    expect(
      resolveReaderToc({
        toc,
        currentHref: "missing.xhtml",
        currentPage: 5,
        currentTitle: "  ",
      }),
    ).toMatchObject({
      index: 0,
      reason: "closest-before",
    })
  })

  it("should ignore current title that is not in the toc", () => {
    const toc = [
      tocItem("Chapter", "chapter.xhtml", 1),
      tocItem("Section", "chapter.xhtml#section", 10, 1),
    ]

    expect(
      resolveReaderToc({
        toc,
        currentHref: "missing.xhtml",
        currentPage: 5,
        currentTitle: "Missing Section",
      }),
    ).toMatchObject({
      index: 0,
      reason: "closest-before",
    })
  })

  it("should ignore future current title before it is visible", () => {
    const toc = [
      tocItem("Chapter", "chapter.xhtml", 1),
      tocItem("Section", "chapter.xhtml#section", 10, 1),
    ]

    expect(
      resolveReaderToc({
        toc,
        currentHref: "missing.xhtml",
        currentPage: 5,
        currentTitle: "Section",
      }),
    ).toMatchObject({
      index: 0,
      reason: "closest-before",
    })
  })

  it("should fall back to href when current page is unavailable", () => {
    const toc = [
      tocItem("Intro", "intro.xhtml"),
      tocItem("Chapter", "chapter.xhtml"),
    ]

    expect(resolveIndex(toc, "OPS/chapter.xhtml", null)).toBe(1)
  })
})
