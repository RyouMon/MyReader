import { describe, expect, it } from "vitest"

import {
  locatorProgressionToPercent,
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
})
