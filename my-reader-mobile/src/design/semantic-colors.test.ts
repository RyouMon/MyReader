function loadSemanticColors(os: string, version?: number | string) {
  jest.resetModules()
  jest.doMock("react-native", () => ({
    Platform: { OS: os, Version: version },
    PlatformColor: jest.fn((name: string) => `platform:${name}`),
  }))
  const module =
    require("./semantic-colors") as typeof import("./semantic-colors")
  const { PlatformColor } = jest.requireMock("react-native")
  return { ...module, PlatformColor }
}

describe("semantic platform colors", () => {
  afterEach(() => {
    jest.dontMock("react-native")
  })

  test("should use iOS system red when platform is iOS", () => {
    const { getSemanticDestructiveColor, PlatformColor } =
      loadSemanticColors("ios")

    expect(getSemanticDestructiveColor()).toBe("platform:systemRed")
    expect(PlatformColor).toHaveBeenCalledWith("systemRed")
  })

  test("should use Material error colors when Android API is modern", () => {
    const {
      getSemanticDestructiveColor,
      getSemanticOnDestructiveColor,
      PlatformColor,
    } = loadSemanticColors("android", 34)

    expect(getSemanticDestructiveColor()).toBe(
      "platform:?android:attr/colorError",
    )
    expect(getSemanticOnDestructiveColor()).toBe(
      "platform:?android:attr/colorOnError",
    )
    expect(PlatformColor).toHaveBeenCalledWith("?android:attr/colorError")
    expect(PlatformColor).toHaveBeenCalledWith("?android:attr/colorOnError")
  })

  test("should use Android holo red fallback when Android API is below 26", () => {
    const {
      getSemanticDestructiveColor,
      getSemanticOnDestructiveColor,
      PlatformColor,
    } = loadSemanticColors("android", 25)

    expect(getSemanticDestructiveColor()).toBe(
      "platform:@android:color/holo_red_dark",
    )
    expect(getSemanticOnDestructiveColor()).toBe("#FFFFFF")
    expect(PlatformColor).toHaveBeenCalledWith("@android:color/holo_red_dark")
  })

  test("should use web fallback when platform is not native", () => {
    const { getSemanticDestructiveColor, getSemanticOnDestructiveColor } =
      loadSemanticColors("web", "unknown")

    expect(getSemanticDestructiveColor()).toBe("#D53030")
    expect(getSemanticOnDestructiveColor()).toBe("#FFFFFF")
  })
})
