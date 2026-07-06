import { describe, expect, it } from "vitest"
import {
  getProgressDisplay,
  locatorToPercent,
  readingProgressRowsToMap,
} from "@/lib/readingProgress"

const t = (key: string) => key

describe("locatorToPercent", () => {
  it("should prefer total progression when resource progression is also available", () => {
    expect(
      locatorToPercent({
        href: "chapter.xhtml",
        locations: { progression: 0.4, totalProgression: 0.25 },
      }),
    ).toBe(25)
  })

  it("should clamp resource progression when total progression is missing", () => {
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

  it("should return undefined when no usable progression exists", () => {
    expect(locatorToPercent({ href: "chapter.xhtml" })).toBeUndefined()
    expect(locatorToPercent(null)).toBeUndefined()
  })
})

describe("readingProgressRowsToMap", () => {
  it("should index progress by book id and uppercase format when rows are mapped", () => {
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
  it("should match mobile progress labels when progress display is requested", () => {
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
