import { getLocales } from "expo-localization"
import { resolveAppLanguage } from "."

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

  it("should fall back to Simplified Chinese when the language is unsupported", () => {
    expect(resolveAppLanguage("ja-JP")).toBe("zh-CN")
  })
})
