import { Locator } from "@readium/shared"
import { describe, expect, it } from "vitest"

import { locatorDisplayPosition, locatorToJson } from "../readium/locator"

describe("locatorToJson", () => {
  it("should persist a canonical locator when a desktop asset href is saved", () => {
    const locator = Locator.deserialize({
      href: "asset://localhost/%2Ftmp%2Fextracted%2Fruntime-id%2FOPS%2Fchapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        position: 3,
        progression: 0.4,
        totalProgression: 0.4,
        fragments: ["part"],
      },
    })

    expect(locator).not.toBeNull()
    expect(locatorToJson(locator!)).toEqual({
      href: "OPS/chapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        position: 3,
        progression: 0.4,
        totalProgression: 0.4,
        fragments: ["part"],
      },
    })
  })
})

describe("locatorDisplayPosition", () => {
  it.each([
    [{ position: 3, totalProgression: 0.9 }, 10, 3],
    [{ totalProgression: 0.5 }, 10, 6],
    [{ totalProgression: 0 }, 10, 1],
    [{ totalProgression: 1 }, 10, 10],
    [{ totalProgression: 0.7 }, 1, 1],
    [{}, 0, 1],
  ])("uses explicit positions before estimating one-based progress: %j", (locations, total, expected) => {
    const locator = Locator.deserialize({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations,
    })
    expect(locatorDisplayPosition(locator ?? null, total)).toBe(expected)
  })
  it("starts at the first position without a saved locator", () => {
    expect(locatorDisplayPosition(null, 100)).toBe(1)
  })
})
