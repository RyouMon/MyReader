import type { Link, Locator } from "@my-reader/readium"

import {
  buildTocItemId,
  chapterTitleForLocator,
  findLocatorForLinkHref,
  hrefRoughlyMatches,
  linksToTocItems,
  positionIndexForLocator,
  resolveNativeLocator,
  stripFragment,
} from "./reader-reflow-navigation"

function locator(
  href: string,
  locations: Partial<NonNullable<Locator["locations"]>> = {},
): Locator {
  return { href, locations: { progression: 0, ...locations } } as Locator
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

  it("should return href index when locator href matches a position", () => {
    expect(positionIndexForLocator(positions, locator("chapter-3.xhtml"))).toBe(
      2,
    )
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

  it("should resolve chapter title from toc when locator has no title", () => {
    const links: Link[] = [
      { href: "chapter-1.xhtml", title: "Intro" } as Link,
      { href: "chapter-2.xhtml", title: "Second Chapter" } as Link,
    ]
    const tocItems = linksToTocItems(links, positions)

    expect(
      chapterTitleForLocator(tocItems, positions, locator("chapter-2.xhtml")),
    ).toBe("Second Chapter")
  })

  it("should keep the nearest previous toc title when locator href is unmatched", () => {
    const links: Link[] = [
      { href: "chapter-1.xhtml", title: "Intro" } as Link,
      { href: "chapter-2.xhtml", title: "Second Chapter" } as Link,
    ]
    const tocItems = linksToTocItems(links, positions)

    expect(
      chapterTitleForLocator(
        tocItems,
        positions,
        locator("unmatched.xhtml", { totalProgression: 0.9 }),
      ),
    ).toBe("Second Chapter")
  })
})
