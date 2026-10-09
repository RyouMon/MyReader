import { describe, expect, it } from "vitest"
import {
  LANGUAGE_NAMES,
  matchLanguage,
  resolveLanguage,
  SUPPORTED_LANGUAGES,
} from "../src/languages"

describe("application language matching", () => {
  it.each(
    SUPPORTED_LANGUAGES,
  )("preserves the supported preference %s", (language) => {
    expect(resolveLanguage([language])).toBe(language)
    expect(LANGUAGE_NAMES[language]).toBeTruthy()
  })

  it.each([
    ["zh", "zh-CN"],
    ["zh-Hans-SG", "zh-CN"],
    ["zh_TW", "zh-Hant"],
    ["zh-HK", "zh-Hant"],
    ["zh-MO", "zh-Hant"],
    ["zh-Hant-CN", "zh-Hant"],
    ["zh-Hans-HK", "zh-CN"],
    ["en-US", "en"],
    ["ja-JP", "ja"],
    ["ko-KR", "ko"],
    ["es-MX", "es"],
    ["fr-CA", "fr"],
    ["de-AT", "de"],
    ["pt", "pt-BR"],
    ["pt-PT", "pt-BR"],
    ["it-IT", "it"],
    ["ru-RU", "ru"],
  ])("matches regional preference %s to %s", (input, expected) => {
    expect(matchLanguage(input)).toBe(expected)
  })

  it("tries the complete preference list in order before falling back to English", () => {
    expect(resolveLanguage(["ar", "ru-RU", "ja-JP"])).toBe("ru")
    expect(resolveLanguage(["ja-JP", "en-US"])).toBe("ja")
    expect(resolveLanguage(["ar", "xx"])).toBe("en")
    expect(resolveLanguage([])).toBe("en")
    expect(matchLanguage("english")).toBeUndefined()
  })
})
