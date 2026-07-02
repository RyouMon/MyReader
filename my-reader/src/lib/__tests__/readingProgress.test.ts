import { describe, expect, it } from "vitest"
import {
  getProgressDisplay,
  locatorToPercent,
  readingProgressRowsToMap,
} from "@/lib/readingProgress"

const t = (key: string) => key

describe("locatorToPercent", () => {
  it("prefers total progression over resource progression", () => {
    expect(
      locatorToPercent({
        href: "chapter.xhtml",
        locations: { progression: 0.4, totalProgression: 0.25 },
      }),
    ).toBe(25)
  })

  it("falls back to resource progression and clamps bounds", () => {
    expect(
      locatorToPercent({
        href: "chapter.xhtml",
        locations: { progression: 1.5 },
      }),
    ).toBe(100)
    expect(
      locatorToPercent({
        href: "chapter.xhtml",
        locations: { progression: -0.1 },
      }),
    ).toBe(0)
  })

  it("returns undefined when no usable progression exists", () => {
    expect(locatorToPercent({ href: "chapter.xhtml" })).toBeUndefined()
    expect(locatorToPercent(null)).toBeUndefined()
  })
})

describe("readingProgressRowsToMap", () => {
  it("indexes progress by book id and uppercase format", () => {
    expect(
      readingProgressRowsToMap([
        {
          bookId: 7,
          format: "epub",
          locator: { locations: { totalProgression: 0.42 } },
        },
        {
          bookId: 8,
          format: "PDF",
          locator: { locations: { progression: 0.8 } },
        },
        {
          bookId: 9,
          format: "CBZ",
          locator: { locations: { position: 3 } },
        },
      ]),
    ).toEqual({
      "7": { EPUB: 42 },
      "8": { PDF: 80 },
    })
  })
})

describe("getProgressDisplay", () => {
  it("matches mobile unread, finished, and percent labels", () => {
    expect(getProgressDisplay(undefined, t)).toMatchObject({
      text: "bookRow.unread",
      isUnread: true,
    })
    expect(getProgressDisplay({ percent: 99.6 }, t)).toMatchObject({
      text: "bookRow.finished",
      isFinished: true,
    })
    expect(getProgressDisplay({ percent: 42.4 }, t)).toMatchObject({
      text: "42%",
      isStatusLabel: false,
    })
  })
})
