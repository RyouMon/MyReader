import { describe, expect, it } from "vitest"

import {
  locatorProgressionToPercent,
  readingProgressDisplay,
  readingProgressRowsToMap,
  readingProgressToPercent,
} from "../src/reading-progress"

describe("reading progress", () => {
  it("should prefer display progression when display and locator progress both exist", () => {
    expect(
      readingProgressToPercent(0.4, {
        locations: { totalProgression: 0.8, progression: 0.6 },
      }),
    ).toBe(40)
  })

  it("should prefer total progression when locator progress is used", () => {
    expect(
      locatorProgressionToPercent({
        locations: { totalProgression: 0.8, progression: 0.6 },
      }),
    ).toBe(80)
  })

  it("should clamp progression when a reader reports values outside the range", () => {
    expect(readingProgressToPercent(2, null)).toBe(100)
    expect(
      locatorProgressionToPercent({ locations: { progression: -1 } }),
    ).toBe(0)
  })

  it("should return undefined when no usable progression exists", () => {
    expect(readingProgressToPercent(null, { href: "chapter.xhtml" })).toBe(
      undefined,
    )
  })

  it("should prefer status label when explicit reading state is available", () => {
    expect(
      readingProgressDisplay(
        { percent: 40, statusLabel: "Downloading" },
        { unread: "Unread", finished: "Finished" },
      ),
    ).toEqual({
      text: "Downloading",
      isUnread: false,
      isFinished: false,
      isStatusLabel: true,
    })
  })

  it("should classify unread finished and active states when progress is displayed", () => {
    const labels = { unread: "Unread", finished: "Finished" }

    expect(readingProgressDisplay(undefined, labels).text).toBe("Unread")
    expect(readingProgressDisplay({ percent: 100 }, labels).text).toBe(
      "Finished",
    )
    expect(readingProgressDisplay({ percent: 42.4 }, labels).text).toBe("42%")
  })

  it("should project progress by book and normalized format when rows are listed", () => {
    expect(
      readingProgressRowsToMap([
        {
          bookId: 42,
          format: "epub",
          locator: { locations: { totalProgression: 0.8 } },
          displayProgression: 0.4,
        },
        {
          bookId: 42,
          format: "pdf",
          locator: { locations: { totalProgression: 0.8 } },
        },
        {
          bookId: 7,
          format: "cbz",
          locator: { href: "page-1.jpg" },
        },
      ]),
    ).toEqual({
      "42": { EPUB: 40, PDF: 80 },
    })
  })
})
