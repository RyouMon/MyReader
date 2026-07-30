import { describe, expect, it } from "vitest"
import {
  displayProgressionForPosition,
  getProgressDisplay,
  positionForDisplayProgressPercent,
  readingProgressRowsToMap,
} from "@/lib/readingProgress"

const t = (key: string) => key

describe("displayProgressionForPosition", () => {
  it("should count the current position as covered for user-facing progress", () => {
    expect(displayProgressionForPosition(1, 3)).toBeCloseTo(1 / 3)
    expect(displayProgressionForPosition(2, 3)).toBeCloseTo(2 / 3)
    expect(displayProgressionForPosition(3, 3)).toBe(1)
  })

  it("should map displayed slots back to their positions", () => {
    expect(positionForDisplayProgressPercent(100 / 3, 3)).toBe(1)
    expect(positionForDisplayProgressPercent(200 / 3, 3)).toBe(2)
    expect(positionForDisplayProgressPercent(100, 3)).toBe(3)
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
          displayProgression: 1,
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
      "7": { EPUB: 100 },
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
