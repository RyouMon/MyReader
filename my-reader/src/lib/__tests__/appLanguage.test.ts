import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getSystemAppLanguage,
  normalizeAppLanguageMode,
  resolveAppLanguage,
} from "@/lib/appLanguage"

describe("appLanguage", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("uses the first supported system language in preference order", () => {
    vi.stubGlobal("navigator", { languages: ["ar-SA", "de-DE", "en-US"] })
    expect(getSystemAppLanguage()).toBe("de")
  })
  it("should use English when the saved language is English", () => {
    expect(resolveAppLanguage("en", "zh-CN")).toBe("en")
  })

  it("should use Simplified Chinese when the system language is Chinese", () => {
    expect(resolveAppLanguage("system", "zh-Hans-CN")).toBe("zh-CN")
  })

  it("should use English when the system language is English", () => {
    expect(resolveAppLanguage("system", "en-US")).toBe("en")
  })

  it("should fall back to English when the system language is unsupported", () => {
    expect(resolveAppLanguage("system", "ar-SA")).toBe("en")
  })

  it("should preserve new and legacy regional preferences", () => {
    expect(normalizeAppLanguageMode("ru")).toBe("ru")
    expect(normalizeAppLanguageMode("zh-TW")).toBe("zh-Hant")
    expect(resolveAppLanguage("ru", "en-US")).toBe("ru")
  })

  it("should fall back to system when a persisted language is invalid", () => {
    expect(normalizeAppLanguageMode("unsupported")).toBe("system")
  })
})
