import { Locator } from "@readium/shared"
import { describe, expect, it } from "vitest"

import { locatorToJson } from "../readium/locator"

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
