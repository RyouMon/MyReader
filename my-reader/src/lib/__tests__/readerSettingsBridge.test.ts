import { describe, expect, it } from "vitest"
import type { ReaderSettings } from "../../components/reader/types"
import {
  readerPaddingXToInlinePaddingPx,
  readerSettingsToEpubPreferences,
} from "../readium/readerSettingsBridge"

const BASE_SETTINGS: ReaderSettings = {
  theme: "paper",
  fontFamily: "default",
  fontFamiliesByLanguage: {},
  fontSize: 18,
  lineHeight: 1.85,
  paddingX: 2.5,
  readingLayout: "paginate",
  textAlign: "auto",
  colCount: "auto",
}

describe("readerSettingsToEpubPreferences", () => {
  it("should set columnCount to 1 when colCount is 1", () => {
    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      colCount: "1",
    })
    expect(prefs.columnCount).toBe(1)
  })

  it("should set columnCount to 2 when colCount is 2", () => {
    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      colCount: "2",
    })
    expect(prefs.columnCount).toBe(2)
  })

  it("should set columnCount to null when colCount is auto", () => {
    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      colCount: "auto",
    })
    expect(prefs.columnCount).toBeNull()
  })

  it("should set optimalLineLength to 35 when building preferences", () => {
    const prefs = readerSettingsToEpubPreferences(BASE_SETTINGS)
    expect(prefs.optimalLineLength).toBe(35)
  })

  it("should use shared reader theme colors when building preferences", () => {
    const prefs = readerSettingsToEpubPreferences(BASE_SETTINGS)
    expect(prefs.backgroundColor).toBe("#E9DDC8")
    expect(prefs.textColor).toBe("#000000")
  })

  it("should keep inline padding at 20px when page margin is 0", () => {
    expect(readerPaddingXToInlinePaddingPx(0)).toBe(20)

    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      paddingX: 0,
    })
    expect(prefs.pageGutter).toBe(20)
  })

  it("should set maximalLineLength to null when colCount is 1", () => {
    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      colCount: "1",
    })
    expect(prefs.maximalLineLength).toBeNull()
  })

  it("should set maximalLineLength to 9999 when colCount is auto", () => {
    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      colCount: "auto",
    })
    expect(prefs.maximalLineLength).toBe(9999)
  })

  it("should omit maximalLineLength when colCount is 2", () => {
    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      colCount: "2",
    })
    expect(prefs.maximalLineLength).toBeUndefined()
  })

  it("should omit fontFamily when reader font is default", () => {
    const prefs = readerSettingsToEpubPreferences(BASE_SETTINGS)

    expect(prefs.fontFamily).toBeUndefined()
  })

  it("should use language fontFamily override when language matches", () => {
    const prefs = readerSettingsToEpubPreferences(
      {
        ...BASE_SETTINGS,
        fontFamily: "serif",
        fontFamiliesByLanguage: { zh: "noto-serif-sc" },
      },
      "zh-Hans",
    )

    expect(prefs.fontFamily).toBe("MyReaderNotoSerifSC")
  })

  it("should use Readium font stack variable when latin option is selected", () => {
    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      fontFamily: "readium-old-style",
    })

    expect(prefs.fontFamily).toBe("var(--RS__oldStyleTf)")
  })
})
