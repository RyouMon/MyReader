import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { describe, expect, it } from "vitest"
import { resolveEpubTtsViewportRelation } from "@/lib/readium/epubTtsViewport"

function locator(totalProgression: number): ReaderLocator {
  return {
    href: "chapter.xhtml",
    type: "application/xhtml+xml",
    locations: { progression: totalProgression, totalProgression },
  }
}

describe("EPUB TTS viewport relation", () => {
  it("orders a detached viewport against the playback locator", () => {
    const playbackLocator = locator(0.5)

    expect(
      resolveEpubTtsViewportRelation({
        viewportDetached: true,
        viewportLocator: locator(0.7),
        playbackLocator,
        positions: [],
      }),
    ).toBe("after")
    expect(
      resolveEpubTtsViewportRelation({
        viewportDetached: true,
        viewportLocator: locator(0.3),
        playbackLocator,
        positions: [],
      }),
    ).toBe("before")
  })

  it("keeps the first forward page ordered after its navigation origin", () => {
    expect(
      resolveEpubTtsViewportRelation({
        viewportDetached: true,
        viewportLocator: locator(0.5),
        viewportOriginLocator: locator(0.4),
        playbackLocator: locator(0.6),
        positions: [],
      }),
    ).toBe("after")
  })

  it("keeps sentence controls while the viewport is attached", () => {
    expect(
      resolveEpubTtsViewportRelation({
        viewportDetached: false,
        viewportLocator: locator(0.7),
        playbackLocator: locator(0.5),
        positions: [],
      }),
    ).toBeNull()
  })

  it("falls back to publication positions", () => {
    const positions: ReaderLocator[] = [
      {
        href: "chapter-1.xhtml",
        type: "application/xhtml+xml",
        locations: { progression: 0, position: 1 },
      },
      {
        href: "chapter-2.xhtml",
        type: "application/xhtml+xml",
        locations: { progression: 0, position: 2 },
      },
    ]

    expect(
      resolveEpubTtsViewportRelation({
        viewportDetached: true,
        viewportLocator: positions[1],
        playbackLocator: positions[0],
        positions,
      }),
    ).toBe("after")
  })
})
