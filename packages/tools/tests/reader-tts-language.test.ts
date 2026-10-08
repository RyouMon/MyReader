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
    expect(normalizeTtsLanguage("  EN_us  ")).toBe("en-us")
    expect(normalizeTtsLanguage(null)).toBe("")
    expect(normalizeTtsLanguage(undefined)).toBe("")
    expect(normalizeTtsLanguage(" ")).toBe("")
    expect(normalizeTtsLanguage("NOT A TAG")).toBe("not a tag")
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
    expect(chooseTtsVoiceForLanguage([], "fr")).toBeUndefined()
    expect(chooseTtsVoiceForLanguage(voices, "zh-CN")?.id).toBe("chinese-cn")
  })

  it.each([
    null,
    undefined,
    "",
    "und",
  ])("ranks unspecified content (%s) without excluding installed voices", (language) => {
    expect(
      filterTtsVoicesForLanguage(voices, language).map((voice) => voice.id),
    ).toEqual([
      "unknown",
      "multilingual",
      "english",
      "chinese-hk",
      "chinese-cn",
    ])
  })

  it("prefers multilingual voices for multilingual content and preserves ties and input order", () => {
    const original = [...voices]
    expect(
      filterTtsVoicesForLanguage(voices, "mul").map((voice) => voice.id),
    ).toEqual([
      "multilingual",
      "unknown",
      "english",
      "chinese-hk",
      "chinese-cn",
    ])
    expect(voices).toEqual(original)
    const regional = [
      { id: "gb", language: "en-GB" },
      { id: "us", language: "en-US" },
    ]
    expect(filterTtsVoicesForLanguage(regional, "en")).toEqual(regional)
  })

  it("formats voice languages for the current interface language", () => {
    expect(formatTtsLanguageName("mul", "zh-CN")).toBe("多语言")
    expect(formatTtsLanguageName("mul", "en")).toBe("Multilingual")
    expect(formatTtsLanguageName("und", "zh-CN")).toBe("未指定语言")
    expect(formatTtsLanguageName("und", "en")).toBe("Unspecified language")
    expect(formatTtsLanguageName("eng", "zh-CN")).not.toBe("eng")
    expect(formatTtsLanguageName("ja-JP", "en")).not.toBe("ja-JP")
    expect(formatTtsLanguageName(null, "en")).toBe("")
    expect(formatTtsLanguageName("mul", undefined)).toBe("Multilingual")
    expect(formatTtsLanguageName("fr", "en")).toBe("French")
    expect(formatTtsLanguageName("invalid tag", "en")).toBe("invalid tag")
    expect(formatTtsLanguageName("en", "invalid locale")).toBe("en")
  })
})
