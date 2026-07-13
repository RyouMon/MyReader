import { describe, expect, it } from "vitest"
import { normalizeAppLanguageMode, resolveAppLanguage } from "@/lib/appLanguage"

describe("appLanguage", () => {
  it("should use English when the saved language is English", () => {
    expect(resolveAppLanguage("en", "zh-CN")).toBe("en")
  })

  it("should use Simplified Chinese when the system language is Chinese", () => {
    expect(resolveAppLanguage("system", "zh-Hans-CN")).toBe("zh-CN")
  })

  it("should use English when the system language is English", () => {
    expect(resolveAppLanguage("system", "en-US")).toBe("en")
  })

  it("should fall back to Simplified Chinese when the system language is unsupported", () => {
    expect(resolveAppLanguage("system", "ja-JP")).toBe("zh-CN")
  })

  it("should fall back to system when a persisted language is invalid", () => {
    expect(normalizeAppLanguageMode("fr")).toBe("system")
  })
})
