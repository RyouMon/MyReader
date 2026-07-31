import { mobileResources } from "@my-reader/i18n/mobile"
import type { ReflowableReaderSettings } from "@/src/store/app-store.types"
import {
  coerceReaderFontOption,
  getReaderFontOptions,
  normalizeReaderLanguage,
  READER_FONT_DECLARATIONS,
  readerFontLanguageKey,
  resolveReaderFont,
  resolveReaderLanguage,
  toReadiumFontFamily,
} from "./reader-font-options"

const baseSettings: ReflowableReaderSettings = {
  theme: "paper",
  fontFamily: "default",
  fontFamiliesByLanguage: {},
  fontSize: 18,
  lineHeight: 1.85,
  paddingX: 20,
  textAlign: "auto",
  columnCount: "auto",
}

describe("reader font options", () => {
  const en = mobileResources.en.translation
  const zh = mobileResources["zh-CN"].translation

  const localeValue = (locale: object, key: string) =>
    key.split(".").reduce<unknown>((value, segment) => {
      if (!value || typeof value !== "object") return undefined
      return (value as Record<string, unknown>)[segment]
    }, locale)

  it("normalizes BCP-47 language tags for matching", () => {
    expect(normalizeReaderLanguage(" zh_Hans_CN ")).toBe("zh-hans-cn")
    expect(readerFontLanguageKey("zh-Hans-CN")).toBe("zh")
  })

  it("uses publication language before Calibre fallback language", () => {
    expect(resolveReaderLanguage(["en"], ["zh"])).toBe("en")
    expect(resolveReaderLanguage([], ["zh"])).toBe("zh")
  })

  it("returns Chinese font choices for Chinese publications", () => {
    expect(getReaderFontOptions("zh-CN").map((option) => option.key)).toEqual([
      "default",
      "noto-sans-sc",
      "noto-serif-sc",
      "lxgw-wenkai",
      "975-maru-sc",
    ])
  })

  it("should translate mobile font labels when options are shown", () => {
    const options = [
      ...getReaderFontOptions("en"),
      ...getReaderFontOptions("zh"),
    ]

    for (const option of options) {
      expect(localeValue(en, option.labelKey)).toEqual(expect.any(String))
      expect(localeValue(zh, option.labelKey)).toEqual(expect.any(String))
    }
  })

  it("resolves exact language, primary language, then global font", () => {
    expect(
      resolveReaderFont("zh-Hans-CN", {
        ...baseSettings,
        fontFamily: "sans",
        fontFamiliesByLanguage: {
          zh: "noto-serif-sc",
          "zh-hans-cn": "noto-sans-sc",
        },
      }),
    ).toBe("noto-sans-sc")

    expect(
      resolveReaderFont("zh-TW", {
        ...baseSettings,
        fontFamily: "sans",
        fontFamiliesByLanguage: { zh: "noto-serif-sc" },
      }),
    ).toBe("noto-serif-sc")
  })

  it("coerces an unavailable persisted font to the first available option", () => {
    expect(coerceReaderFontOption("serif", getReaderFontOptions("zh"))).toBe(
      "default",
    )
  })

  it("maps app font keys to Readium font family strings", () => {
    expect(toReadiumFontFamily("default")).toBeUndefined()
    expect(toReadiumFontFamily("sans")).toBe("sans-serif")
    expect(toReadiumFontFamily("noto-sans-sc")).toBe("MyReaderNotoSansSC")
    expect(toReadiumFontFamily("noto-serif-sc")).toBe("MyReaderNotoSerifSC")
    expect(toReadiumFontFamily("lxgw-wenkai")).toBe("MyReaderLXGWWenKai")
    expect(toReadiumFontFamily("975-maru-sc")).toBe("MyReaderAlimamaFangYuanTi")
  })

  it("should declare bundled Chinese font assets when registering Readium fonts", () => {
    expect(READER_FONT_DECLARATIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fontFamily: "MyReaderNotoSansSC",
          fontFaces: [
            expect.objectContaining({
              source: "reader-fonts/NotoSansSC-Regular.ttf",
            }),
          ],
        }),
        expect.objectContaining({
          fontFamily: "MyReaderNotoSerifSC",
          fontFaces: [
            expect.objectContaining({
              source: "reader-fonts/NotoSerifSC-Regular.ttf",
            }),
          ],
        }),
        expect.objectContaining({
          fontFamily: "MyReaderLXGWWenKai",
          fontFaces: [
            expect.objectContaining({
              source: "reader-fonts/LXGWWenKai-Regular.woff2",
            }),
          ],
        }),
        expect.objectContaining({
          fontFamily: "MyReaderAlimamaFangYuanTi",
          fontFaces: [
            expect.objectContaining({
              source: "reader-fonts/AlimamaFangYuanTiVF.ttf",
            }),
          ],
        }),
      ]),
    )
  })
})
