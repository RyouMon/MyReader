import { describe, expect, it } from "vitest"
import { epubNavigatorDefaultsForLayout } from "../readium/epubReaderPrefs"

describe("epubNavigatorDefaultsForLayout", () => {
  it("enables Readium's media-aware zoom for reflowable EPUBs", () => {
    expect(epubNavigatorDefaultsForLayout(false)).toEqual({
      experiments: ["experimentalZoom"],
    })
  })

  it("does not apply reflowable experiments to fixed-layout EPUBs", () => {
    expect(epubNavigatorDefaultsForLayout(true)).toEqual({})
  })
})
