import type { ReactElement } from "react"
import { Platform } from "react-native"

import { useStackScreenOptions } from "./use-stack-screen-options"

const mockRouterBack = jest.fn()

jest.mock("expo-router", () => ({
  router: {
    back: (...args: unknown[]) => mockRouterBack(...args),
  },
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    text: "#111111",
  }),
}))

jest.mock("@/src/components/ui/header-back-button", () => ({
  HeaderBackButton: () => null,
}))

describe("useStackScreenOptions", () => {
  const originalPlatform = Platform.OS

  afterEach(() => {
    mockRouterBack.mockClear()
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    })
  })

  it("should use native stack back when platform is iOS", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" })

    const options = useStackScreenOptions()

    expect(options.headerBackVisible).toBe(true)
    expect(options.headerLeft).toBeUndefined()
  })

  it("should use a single custom back button when platform is Android", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    })

    const options = useStackScreenOptions()

    expect(options.headerBackVisible).toBe(false)
    expect(options.headerLeft).toEqual(expect.any(Function))
  })

  it("should render no left header when Android cannot go back", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    })

    const options = useStackScreenOptions()
    const headerLeft = options.headerLeft

    expect(headerLeft?.({ canGoBack: false } as never)).toBeNull()
  })

  it("should call router back when Android back button is pressed", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    })

    const options = useStackScreenOptions()
    const headerLeft = options.headerLeft
    if (!headerLeft) {
      throw new Error("Expected Android headerLeft")
    }
    const headerLeftElement = headerLeft({
      canGoBack: true,
    } as never) as ReactElement<{
      children: ReactElement<{ onPress: () => void }>
    }>

    headerLeftElement.props.children.props.onPress()

    expect(mockRouterBack).toHaveBeenCalledTimes(1)
  })
})
