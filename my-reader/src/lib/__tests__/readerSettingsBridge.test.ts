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
  it("colCount='1' 时 columnCount 应为 1", () => {
    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      colCount: "1",
    })
    expect(prefs.columnCount).toBe(1)
  })

  it("colCount='2' 时 columnCount 应为 2", () => {
    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      colCount: "2",
    })
    expect(prefs.columnCount).toBe(2)
  })

  it("colCount='auto' 时 columnCount 应为 null", () => {
    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      colCount: "auto",
    })
    expect(prefs.columnCount).toBeNull()
  })

  it("应设置 optimalLineLength 为 35（适合中文阅读，降低自动双栏触发阈值）", () => {
    const prefs = readerSettingsToEpubPreferences(BASE_SETTINGS)
    expect(prefs.optimalLineLength).toBe(35)
  })

  it("colCount='1' 时 maximalLineLength 应为 null（单栏填满容器）", () => {
    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      colCount: "1",
    })
    expect(prefs.maximalLineLength).toBeNull()
  })

  it("colCount='auto' 时 maximalLineLength 应为 9999（避免自动模式出现右侧空白）", () => {
    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      colCount: "auto",
    })
    expect(prefs.maximalLineLength).toBe(9999)
  })

  it("colCount='2' 时 maximalLineLength 应为 undefined（使用 Readium 默认值）", () => {
    const prefs = readerSettingsToEpubPreferences({
      ...BASE_SETTINGS,
      colCount: "2",
    })
    expect(prefs.maximalLineLength).toBeUndefined()
  })
})
