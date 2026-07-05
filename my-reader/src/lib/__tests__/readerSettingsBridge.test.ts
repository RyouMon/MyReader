import { describe, expect, it } from "vitest"
import type { ReaderSettings } from "../../components/reader/types"
import { readerSettingsToEpubPreferences } from "../readium/readerSettingsBridge"

const BASE_SETTINGS: ReaderSettings = {
  theme: "paper",
  fontFamily: "'Lora', serif",
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
})
