import { getLocales } from "expo-localization"
import i18n, { resolveAppLanguage } from "."

jest.mock("expo-localization", () => ({
  getLocales: jest.fn(() => [
    { languageCode: "zh", languageTag: "zh-Hans-CN" },
  ]),
}))

const mockGetLocales = getLocales as jest.MockedFunction<typeof getLocales>

describe("resolveAppLanguage", () => {
  beforeEach(() => {
    mockGetLocales.mockReturnValue([
      {
        languageCode: "zh",
        languageTag: "zh-Hans-CN",
      } as ReturnType<typeof getLocales>[number],
    ])
  })

  it("should normalize legacy Chinese preferences when the persisted value is zh", () => {
    expect(resolveAppLanguage("zh")).toBe("zh-CN")
  })

  it("should normalize regional English preferences when the persisted value includes a region", () => {
    expect(resolveAppLanguage("en-US")).toBe("en")
  })

  it("should use the system language when the persisted preference is empty", () => {
    mockGetLocales.mockReturnValue([
      {
        languageCode: "en",
        languageTag: "en-GB",
      } as ReturnType<typeof getLocales>[number],
    ])

    expect(resolveAppLanguage("")).toBe("en")
  })

  it("should use the system language when the persisted preference is system", () => {
    mockGetLocales.mockReturnValue([
      {
        languageCode: "en",
        languageTag: "en-US",
      } as ReturnType<typeof getLocales>[number],
    ])

    expect(resolveAppLanguage("system")).toBe("en")
  })

  it("should try all system languages and respect an explicit preference", () => {
    const locale = mockGetLocales()[0]
    mockGetLocales.mockReturnValue([
      { ...locale, languageTag: "ar-SA", languageCode: "ar" },
      { ...locale, languageTag: "ru-RU", languageCode: "ru" },
    ])
    expect(resolveAppLanguage("system")).toBe("ru")
    expect(resolveAppLanguage("ja-JP")).toBe("ja")
    expect(resolveAppLanguage("zh-HK")).toBe("zh-Hant")
  })

  it("should fall back to English when the language is unsupported", () => {
    expect(resolveAppLanguage("ar-SA")).toBe("en")
  })

  it("renders Russian counts using the bundled plural rules and resources", () => {
    const russian = i18n.cloneInstance({ lng: "ru" })
    expect(russian.t("library.collections.bookCount", { count: 1 })).toBe(
      "1 книга",
    )
    expect(russian.t("library.collections.bookCount", { count: 2 })).toBe(
      "2 книги",
    )
    expect(russian.t("library.collections.bookCount", { count: 5 })).toBe(
      "5 книг",
    )
    expect(russian.t("library.collections.bookCount", { count: 21 })).toBe(
      "21 книга",
    )
  })
})
