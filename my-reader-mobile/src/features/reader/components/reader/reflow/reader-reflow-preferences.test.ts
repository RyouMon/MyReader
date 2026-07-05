import {
  buildPreferences,
  toReadiumThemeToken,
} from "./reader-reflow-preferences"

describe("reader reflow preferences", () => {
  it("should map theme groups when building Readium theme token", () => {
    expect(toReadiumThemeToken("night")).toBe("dark")
    expect(toReadiumThemeToken("contrast1")).toBe("dark")
    expect(toReadiumThemeToken("contrast2")).toBe("dark")
    expect(toReadiumThemeToken("ocean")).toBe("dark")
    expect(toReadiumThemeToken("paper")).toBe("sepia")
    expect(toReadiumThemeToken("green")).toBe("sepia")
    expect(toReadiumThemeToken("neutral")).toBe("light")
  })

  it("should include serif font and auto layout when requested", () => {
    expect(
      buildPreferences("paper", "serif", 18, 1.85, 20, "auto", "auto"),
    ).toMatchObject({
      theme: "sepia",
      fontFamily: "serif",
      fontSize: 1.125,
      lineHeight: 1.85,
      pageMargins: 0.8,
      publisherStyles: false,
    })
  })

  it("should include sans font and explicit layout when requested", () => {
    expect(
      buildPreferences("night", "sans", 20, 2, 0, "justify", "1"),
    ).toMatchObject({
      theme: "dark",
      fontFamily: "sans-serif",
      textAlign: "justify",
      columnCount: "1",
    })
  })

  it("should omit optional preferences when using system font and auto layout", () => {
    const prefs = buildPreferences(
      "neutral",
      "system",
      16,
      1.5,
      10,
      "auto",
      "auto",
    )

    expect(prefs.fontFamily).toBeUndefined()
    expect(prefs.textAlign).toBeUndefined()
    expect(prefs.columnCount).toBeUndefined()
  })

  it("should use neutral colors when theme is unknown", () => {
    expect(
      buildPreferences(
        "unknown" as never,
        "system",
        16,
        1.5,
        10,
        "auto",
        "auto",
      ),
    ).toMatchObject({
      theme: "light",
      textColor: "#000000",
      backgroundColor: "#fefefe",
    })
  })

  it("should map start alignment when text align is start", () => {
    expect(
      buildPreferences("neutral", "system", 16, 1.5, 10, "start", "auto")
        .textAlign,
    ).toBe("start")
  })
})
