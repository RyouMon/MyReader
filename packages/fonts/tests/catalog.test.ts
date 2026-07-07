import { describe, expect, it } from "vitest"
import {
  coerceReaderFontFamily,
  getReaderFontFamilyDeclarations,
  getReaderFontOptions,
  isChineseReaderLanguage,
  normalizeReaderFontFamiliesByLanguage,
  READER_FONT_FAMILIES,
  READER_FONT_FAMILY_KEYS,
  readerFontLanguageKey,
  resolveReaderFont,
  toReadiumFontFamily,
} from "../src/catalog"

describe("reader font catalog", () => {
  it("should keep catalog keys unique", () => {
    expect(new Set(READER_FONT_FAMILY_KEYS).size).toBe(
      READER_FONT_FAMILY_KEYS.length,
    )
    expect(READER_FONT_FAMILIES.map((font) => font.key)).toEqual(
      READER_FONT_FAMILY_KEYS,
    )
  })

  it("should normalize Chinese language aliases", () => {
    expect(isChineseReaderLanguage("zh-Hans")).toBe(true)
    expect(isChineseReaderLanguage("zho")).toBe(true)
    expect(isChineseReaderLanguage("chi")).toBe(true)
    expect(readerFontLanguageKey("zh_Hans")).toBe("zh")
    expect(readerFontLanguageKey("zho")).toBe("zh")
  })

  it("should expose platform-specific Chinese font options", () => {
    expect(
      getReaderFontOptions("zh-CN", "desktop").map((option) => option.key),
    ).toEqual([
      "default",
      "noto-sans-sc",
      "noto-serif-sc",
      "lxgw-wenkai-gb",
      "975-maru-sc",
    ])
    expect(
      getReaderFontOptions("zh-CN", "mobile").map((option) => option.key),
    ).toEqual([
      "default",
      "noto-sans-sc",
      "noto-serif-sc",
      "lxgw-wenkai",
      "975-maru-sc",
    ])
  })

  it("should expose mobile-only accessible Latin fonts only on mobile", () => {
    expect(
      getReaderFontOptions("en", "desktop").map((option) => option.key),
    ).not.toContain("open-dyslexic")
    expect(
      getReaderFontOptions("en", "mobile").map((option) => option.key),
    ).toContain("open-dyslexic")
  })

  it("should coerce legacy and unsupported platform values", () => {
    expect(coerceReaderFontFamily("system")).toBe("default")
    expect(coerceReaderFontFamily("lxgw-wenkai", "desktop")).toBe(
      "lxgw-wenkai-gb",
    )
    expect(coerceReaderFontFamily("lxgw-wenkai-gb", "mobile")).toBe(
      "lxgw-wenkai",
    )
  })

  it("should normalize persisted language font maps", () => {
    expect(
      normalizeReaderFontFamiliesByLanguage(
        {
          "zh-Hans": "noto-serif-sc",
          zho: "lxgw-wenkai",
          bad: "not-a-font",
        },
        "desktop",
      ),
    ).toEqual({
      zh: "lxgw-wenkai-gb",
      bad: "default",
    })
  })

  it("should resolve exact language, primary language, then global font", () => {
    expect(
      resolveReaderFont(
        "zh-Hant",
        {
          fontFamily: "sans",
          fontFamiliesByLanguage: {
            zh: "noto-sans-sc",
            "zh-hant": "noto-serif-sc",
          },
        },
        "desktop",
      ),
    ).toBe("noto-serif-sc")
    expect(
      resolveReaderFont(
        "zh-Hans",
        {
          fontFamily: "sans",
          fontFamiliesByLanguage: { zh: "noto-sans-sc" },
        },
        "desktop",
      ),
    ).toBe("noto-sans-sc")
  })

  it("should map app keys to Readium font families by platform", () => {
    expect(toReadiumFontFamily("readium-old-style", "desktop")).toBe(
      "var(--RS__oldStyleTf)",
    )
    expect(toReadiumFontFamily("readium-old-style", "mobile")).toBe(
      "Iowan Old Style",
    )
    expect(toReadiumFontFamily("975-maru-sc", "desktop")).toBe(
      "MyReaderAlimamaFangYuanTi",
    )
  })

  it("should build native Readium font declarations from catalog", () => {
    expect(getReaderFontFamilyDeclarations("mobile")).toEqual(
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

  it("should omit non-native variable font weights from native declarations", () => {
    const fangYuanTiFaces = getReaderFontFamilyDeclarations("desktop").find(
      (declaration) => declaration.fontFamily === "MyReaderAlimamaFangYuanTi",
    )?.fontFaces

    expect(fangYuanTiFaces).toEqual([
      expect.objectContaining({ weight: undefined }),
    ])
  })
})
