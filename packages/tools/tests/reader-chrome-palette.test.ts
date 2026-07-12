import chroma from "chroma-js"
import { describe, expect, it } from "vitest"
import {
  mixReaderChromeColor,
  readerChromePalette,
} from "../src/reader-chrome-palette"

describe("readerChromePalette", () => {
  it("should derive surrounding chrome colors from a light reading theme", () => {
    const palette = readerChromePalette("#000000", "#C5E7CD")

    expect(palette.bg).toBe("#C5E7CD")
    expect(palette.sheetSurface).toBe(
      mixReaderChromeColor("#000000", "#C5E7CD", 4),
    )
    expect(palette.tocRowIdle).toBe(
      mixReaderChromeColor("#000000", "#C5E7CD", 4),
    )
    expect(palette.segmentIdle).toBe(
      mixReaderChromeColor("#000000", "#C5E7CD", 8),
    )
    expect(
      chroma.contrast(palette.actionSurface, palette.actionText),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it("should derive readable dark chrome colors from a dark reading theme", () => {
    const palette = readerChromePalette("#ffffff", "#181842")

    expect(palette.sheetSurface).toBe(
      mixReaderChromeColor("#ffffff", "#181842", 4),
    )
    expect(palette.textMuted).toBe(
      mixReaderChromeColor("#ffffff", "#181842", 55),
    )
    expect(
      chroma.contrast(palette.actionSurface, palette.actionText),
    ).toBeGreaterThanOrEqual(4.5)
  })
})
