import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native"
import type { ReactNode } from "react"
import { Platform } from "react-native"

import LibrarySwitcherSheetRoute from "@/src/app/switch-library"

let mockLibraries: { id: string }[] = []

jest.mock("@expo/material-symbols/add.xml", () => ({ uri: "add" }))
jest.mock("@expo/material-symbols/close.xml", () => ({ uri: "close" }))

jest.mock("expo-router", () => {
  const React = jest.requireActual<typeof import("react")>("react")
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native")

  function Toolbar({
    children,
    placement,
  }: {
    children: ReactNode
    placement: string
  }) {
    return React.createElement(
      ReactNative.View,
      { testID: `toolbar-${placement}` },
      children,
    )
  }

  Toolbar.Button = function ToolbarButton({
    accessibilityLabel,
    onPress,
  }: {
    accessibilityLabel: string
    onPress: () => void
  }) {
    return React.createElement(ReactNative.Pressable, {
      accessibilityLabel,
      accessibilityRole: "button",
      onPress,
    })
  }

  return {
    router: {
      back: jest.fn(),
      canGoBack: jest.fn(() => true),
      push: jest.fn(),
      replace: jest.fn(),
    },
    Stack: { Toolbar },
  }
})

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("@/src/components/ui/android-header-icon-button", () => ({
  AndroidHeaderIconButton: ({
    accessibilityLabel,
    onPress,
    testID,
  }: {
    accessibilityLabel: string
    onPress: () => void
    testID?: string
  }) => {
    const React = jest.requireActual<typeof import("react")>("react")
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native")
    return React.createElement(ReactNative.Pressable, {
      accessibilityLabel,
      accessibilityRole: "button",
      onPress,
      testID,
    })
  },
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({ background: "#fff", text: "#111" }),
}))

jest.mock("@/src/features/library/components/library-switcher-list", () => ({
  LibrarySwitcherList: () => null,
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: jest.fn((selector) => selector({ libraries: mockLibraries })),
}))

describe("LibrarySwitcherSheetRoute", () => {
  const initialPlatform = Platform.OS

  afterEach(() => {
    const { router } = jest.requireMock("expo-router")
    mockLibraries = []
    router.back.mockClear()
    router.push.mockClear()
    router.replace.mockClear()
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: initialPlatform,
    })
  })

  it("should keep populated sheet content mounted and filling the sheet", () => {
    mockLibraries = [{ id: "library-1" }]

    render(<LibrarySwitcherSheetRoute />)

    expect(screen.getByTestId("library-switcher-content")).toHaveProp(
      "collapsable",
      false,
    )
    expect(screen.getByTestId("library-switcher-content")).toHaveStyle({
      flex: 1,
    })
    expect(screen.getByTestId("library-switcher-scroll-view")).toHaveStyle({
      flex: 1,
    })
  })

  it("should keep close on the left and add library on the right on iOS", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    })

    render(<LibrarySwitcherSheetRoute />)

    const closeButton = within(screen.getByTestId("toolbar-left")).getByRole(
      "button",
      { name: "library.switchLibraryAlert.close" },
    )
    const addButton = within(screen.getByTestId("toolbar-right")).getByRole(
      "button",
      { name: "library.addLibrary" },
    )
    fireEvent.press(closeButton)
    fireEvent.press(addButton)

    const { router } = jest.requireMock("expo-router")
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith("/settings/add-library")
  })

  it("should expose fixed close and add actions on Android", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    })

    render(<LibrarySwitcherSheetRoute />)

    fireEvent.press(screen.getByTestId("library-switcher-close-button"))
    fireEvent.press(screen.getByTestId("library-switcher-add-button"))

    const { router } = jest.requireMock("expo-router")
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith("/settings/add-library")
  })
})
