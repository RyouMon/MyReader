import { Locator } from "@readium/shared"
import { describe, expect, it } from "vitest"

import {
  locatorDisplayPosition,
  locatorToJson,
  resolveInitialEpubPosition,
} from "../readium/locator"

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

describe("resolveInitialEpubPosition", () => {
  const chapterStart = Locator.deserialize({
    href: "OPS/chapter.xhtml",
    type: "application/xhtml+xml",
    locations: { position: 1, progression: 0, totalProgression: 0 },
  })!

  it("restores the saved page within a chapter instead of its coarse position", () => {
    const saved = Locator.deserialize({
      href: "OPS/chapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        position: 1,
        progression: 0.5,
        totalProgression: 0.5,
        fragments: ["page-two"],
      },
      text: { highlight: "Latest narration second page." },
    })!
    const restored = resolveInitialEpubPosition([chapterStart], saved)
    expect(restored?.serialize()).toEqual(saved.serialize())
  })
  it("maps persisted relative hrefs to the current publication without losing anchors", () => {
    const resource = Locator.deserialize({
      href: "asset://localhost/%2Ftmp%2Fextracted%2Fnew-runtime%2FOPS%2Fchapter.xhtml",
      type: "application/xhtml+xml",
      locations: { position: 1, progression: 0 },
    })!
    const saved = Locator.deserialize({
      href: "OPS/chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.6, fragments: ["paragraph-two"] },
    })!
    expect(resolveInitialEpubPosition([resource], saved)?.serialize()).toEqual({
      ...saved.serialize(),
      href: resource.href,
    })
  })

  it("falls back to the saved overall position when the resource is unavailable", () => {
    const nextChapter = Locator.deserialize({
      href: "OPS/next.xhtml",
      type: "application/xhtml+xml",
      locations: { position: 2 },
    })!
    const saved = Locator.deserialize({
      href: "missing.xhtml",
      type: "application/xhtml+xml",
      locations: { totalProgression: 1 },
    })!
    expect(resolveInitialEpubPosition([chapterStart, nextChapter], saved)).toBe(
      nextChapter,
    )
  })

  it("starts unread books at their first position and rejects empty position lists", () => {
    expect(resolveInitialEpubPosition([chapterStart], null)).toBe(chapterStart)
    expect(resolveInitialEpubPosition([], chapterStart)).toBeNull()
  })
})
