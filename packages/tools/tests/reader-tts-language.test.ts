import { describe, expect, it } from "vitest"

import {
  chooseTtsVoiceForLanguage,
  filterTtsVoicesForLanguage,
  formatTtsLanguageName,
  normalizeTtsLanguage,
  ttsLanguageMatches,
} from "../src/reader-tts-language"

const voices = [
  { id: "english", language: "en-US" },
  { id: "chinese-hk", language: "zh-HK" },
  { id: "multilingual", language: "mul" },
  { id: "chinese-cn", language: "zh-CN" },
  { id: "unknown", language: "und" },
]

describe("reader TTS languages", () => {
  it("canonicalizes Calibre and BCP 47 language codes", () => {
    expect(normalizeTtsLanguage("eng")).toBe("en")
    expect(normalizeTtsLanguage("zho")).toBe("zh")
    expect(normalizeTtsLanguage("zh_CN")).toBe("zh-cn")
  })

  it("filters and ranks voices for the publication language", () => {
    expect(
      filterTtsVoicesForLanguage(voices, "zh-CN").map((voice) => voice.id),
    ).toEqual(["chinese-cn", "chinese-hk", "multilingual", "unknown"])
  })

  it("matches equivalent two-letter and three-letter language codes", () => {
    expect(ttsLanguageMatches("en-US", "eng")).toBe(true)
    expect(ttsLanguageMatches("ja-JP", "zho")).toBe(false)
  })

  it("keeps a deterministic fallback when no matching voice is installed", () => {
    expect(chooseTtsVoiceForLanguage(voices.slice(0, 1), "fr")?.id).toBe(
      "english",
    )
  })

  it("formats voice languages for the current interface language", () => {
    expect(formatTtsLanguageName("mul", "zh-CN")).toBe("多语言")
    expect(formatTtsLanguageName("mul", "en")).toBe("Multilingual")
    expect(formatTtsLanguageName("und", "zh-CN")).toBe("未指定语言")
    expect(formatTtsLanguageName("und", "en")).toBe("Unspecified language")
    expect(formatTtsLanguageName("eng", "zh-CN")).not.toBe("eng")
    expect(formatTtsLanguageName("ja-JP", "en")).not.toBe("ja-JP")
  })
})
