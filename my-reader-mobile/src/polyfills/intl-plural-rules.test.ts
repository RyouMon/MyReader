import "./intl-plural-rules"
import { SUPPORTED_LANGUAGES } from "@my-reader/i18n/languages"

describe("mobile plural rules", () => {
  it("supports all app languages without relying on native plural rules", () => {
    expect(
      Intl.PluralRules.supportedLocalesOf([...SUPPORTED_LANGUAGES]),
    ).toEqual([...SUPPORTED_LANGUAGES])
  })

  it.each([
    [1, "one"],
    [2, "few"],
    [5, "many"],
    [21, "one"],
    [1.5, "other"],
  ])("selects the Russian category for %s", (count, expected) => {
    expect(new Intl.PluralRules("ru").select(Number(count))).toBe(expected)
  })
})
