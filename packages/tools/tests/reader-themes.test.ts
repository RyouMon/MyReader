import { describe, expect, it } from "vitest"
import {
  readerThemePresetFor,
  READER_THEME_PRESET_BY_KEY,
  READER_THEME_PRESETS,
} from "../src/reader-themes"

describe("reader themes", () => {
  it("should define Thorium-aligned order when listing presets", () => {
    expect(READER_THEME_PRESETS.map((theme) => theme.key)).toEqual([
      "neutral",
      "paper",
      "sepia",
      "green",
      "ocean",
      "night",
      "contrast1",
      "contrast2",
    ])
  })

  it("should keep reader colors when building lookup", () => {
    expect(READER_THEME_PRESET_BY_KEY.paper).toMatchObject({
      backgroundColor: "#E9DDC8",
      foregroundColor: "#000000",
    })
    expect(READER_THEME_PRESET_BY_KEY.contrast2).toMatchObject({
      backgroundColor: "#000000",
      foregroundColor: "#FFFF00",
    })
  })

  it("should fall back to neutral when theme key is unknown", () => {
    expect(readerThemePresetFor("missing")).toBe(
      READER_THEME_PRESET_BY_KEY.neutral,
    )
  })
})
