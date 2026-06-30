const mockSetBackgroundColorAsync = jest.fn(() => Promise.resolve())
const mockUseColorScheme = jest.fn()
const mockSetThemeMode = jest.fn()

type MockThemeMode = "system" | "light" | "dark"

const mockState = {
  settings: {
    themeMode: "system" as MockThemeMode,
  },
  setThemeMode: mockSetThemeMode,
}

jest.mock("expo-system-ui", () => ({
  __esModule: true,
  setBackgroundColorAsync: mockSetBackgroundColorAsync,
}))

jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native")
  return new Proxy(actual, {
    get(target, property) {
      if (property === "useColorScheme") {
        return () => mockUseColorScheme()
      }
      return target[property]
    },
  })
})

jest.mock("../store/app-store", () => ({
  useAppStore: (selector: (state: typeof mockState) => unknown): unknown =>
    selector(mockState),
}))

const { render, renderHook, waitFor } =
  require("@testing-library/react-native") as typeof import("@testing-library/react-native")
const { Text } = require("react-native") as typeof import("react-native")
const { getThemePalette, ThemeProvider, useTheme, useThemePalette } =
  require("./tokens") as typeof import("./tokens")

describe("getThemePalette", () => {
  test("should return dark palette when color scheme is dark", () => {
    expect(getThemePalette("dark").background).toBe("#1f1b17")
  })

  test("should return light palette when color scheme is light or missing", () => {
    const missingColorScheme = undefined as unknown as Parameters<
      typeof getThemePalette
    >[0]

    expect(getThemePalette("light").background).toBe("#f5efe6")
    expect(getThemePalette(missingColorScheme).background).toBe("#f5efe6")
  })
})

describe("ThemeProvider", () => {
  beforeEach(() => {
    mockSetBackgroundColorAsync.mockClear()
    mockSetThemeMode.mockClear()
    mockState.settings.themeMode = "system"
    mockUseColorScheme.mockReturnValue("light")
  })

  test("should set system light background when system scheme is missing", async () => {
    mockUseColorScheme.mockReturnValue(null)

    render(
      <ThemeProvider>
        <Text>child</Text>
      </ThemeProvider>,
    )

    await waitFor(() => {
      expect(mockSetBackgroundColorAsync).toHaveBeenCalledWith("#f5efe6")
    })
  })

  test("should expose dark theme when mode follows dark system scheme", () => {
    mockUseColorScheme.mockReturnValue("dark")

    const { result } = renderHook(() => useTheme())

    expect(result.current).toMatchObject({
      colorScheme: "dark",
      mode: "system",
      palette: expect.objectContaining({
        background: "#1f1b17",
      }),
    })
  })

  test("should ignore system scheme when mode is forced light", () => {
    mockState.settings.themeMode = "light"
    mockUseColorScheme.mockReturnValue("dark")

    const { result } = renderHook(() => useTheme())
    result.current.setMode("dark")

    expect(result.current.colorScheme).toBe("light")
    expect(result.current.palette.background).toBe("#f5efe6")
    expect(mockSetThemeMode).toHaveBeenCalledWith("dark")
  })

  test("should return only palette when useThemePalette is called", () => {
    mockState.settings.themeMode = "dark"
    mockUseColorScheme.mockReturnValue("light")

    const { result } = renderHook(() => useThemePalette())

    expect(result.current.background).toBe("#1f1b17")
  })
})
