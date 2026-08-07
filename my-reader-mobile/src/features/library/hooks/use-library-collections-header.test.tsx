import { fireEvent, render, renderHook } from "@testing-library/react-native"
import type { ReactNode } from "react"
import { Platform } from "react-native"

import { useLibraryCollectionsHeader } from "./use-library-collections-header"

const mockSyncPress = jest.fn()

jest.mock("@expo/material-symbols/cards_stack.xml", () => ({
  uri: "cards-stack",
}))
jest.mock("@expo/material-symbols/more_vert.xml", () => ({ uri: "more" }))

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

  function ToolbarButton({
    accessibilityLabel,
    children,
    icon,
    onPress,
    tintColor,
  }: {
    accessibilityLabel: string
    children?: ReactNode
    icon?: string
    onPress: () => void
    tintColor?: string
  }) {
    const pressableProps = {
      accessibilityLabel,
      accessibilityRole: "button" as const,
      icon,
      onPress,
      tintColor,
    }
    return React.createElement(
      ReactNative.Pressable,
      pressableProps,
      children == null
        ? null
        : React.createElement(ReactNative.Text, null, children),
    )
  }

  function ToolbarMenu({ children }: { children: ReactNode }) {
    return React.createElement(ReactNative.View, null, children)
  }

  function ToolbarMenuAction({ children }: { children: ReactNode }) {
    return React.createElement(ReactNative.Text, null, children)
  }

  function ToolbarIcon() {
    return null
  }

  Toolbar.Button = ToolbarButton
  Toolbar.Icon = ToolbarIcon
  Toolbar.Menu = ToolbarMenu
  Toolbar.MenuAction = ToolbarMenuAction

  return {
    router: {
      push: jest.fn(),
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
    color,
    onPress,
  }: {
    accessibilityLabel: string
    color?: string
    onPress: () => void
  }) => {
    const React = jest.requireActual<typeof import("react")>("react")
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native")

    const pressableProps = {
      accessibilityLabel,
      accessibilityRole: "button" as const,
      color,
      onPress,
    }
    return React.createElement(ReactNative.Pressable, pressableProps)
  },
}))

jest.mock("@/src/components/ui/android-header-layout", () => ({
  AndroidHeaderSlot: ({ children }: { children: ReactNode }) => children,
}))

jest.mock("@/src/components/ui/android-header-menu-button", () => ({
  AndroidHeaderMenuButton: () => null,
}))

jest.mock("@/src/components/ui/header-toolbar.android", () => ({
  renderHeaderToolbarActions: () => null,
}))

jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: () => ({ options: {}, toolbar: null }),
}))

jest.mock("@/src/features/sync/hooks/use-sync-status-header-action", () => ({
  useSyncStatusHeaderAction: () => ({
    label: "syncStatus.accessibilityLabel",
    onPress: mockSyncPress,
    iosSfSymbol: "icloud",
    iconOnly: true,
  }),
}))

describe("useLibraryCollectionsHeader", () => {
  const initialPlatform = Platform.OS

  afterEach(() => {
    const { router } = jest.requireMock("expo-router")
    router.push.mockClear()
    mockSyncPress.mockClear()
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: initialPlatform,
    })
  })

  it("should open the library switcher sheet from the iOS left toolbar", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    })

    const { result } = renderHook(() =>
      useLibraryCollectionsHeader({
        selectedLibraryName: "My Library",
        canImportBook: true,
        onImportBook: jest.fn(),
      }),
    )
    const screen = render(<>{result.current.toolbar}</>)

    expect(screen.getByTestId("toolbar-left")).toBeTruthy()
    const switcherButton = screen.getByLabelText("library.allLibraries")
    expect(screen.getByText("library.allLibraries")).toBeTruthy()
    expect(switcherButton.props.icon).toBeUndefined()
    expect(switcherButton.props.tintColor).toBeUndefined()
    fireEvent.press(switcherButton)

    const { router } = jest.requireMock("expo-router")
    expect(router.push).toHaveBeenCalledWith("/switch-library")
    expect(screen.queryByText("library.switchLibrary")).toBeNull()

    const syncButton = screen.getByLabelText("syncStatus.accessibilityLabel")
    fireEvent.press(syncButton)
    expect(mockSyncPress).toHaveBeenCalledTimes(1)
  })

  it("should open the library switcher sheet from the Android left header", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    })

    const { result } = renderHook(() =>
      useLibraryCollectionsHeader({
        selectedLibraryName: "My Library",
        canImportBook: true,
        onImportBook: jest.fn(),
      }),
    )
    expect(result.current.options.headerTitleAlign).toBe("center")
    const headerLeft = result.current.options.headerLeft?.({
      canGoBack: false,
      tintColor: undefined,
    })
    const screen = render(<>{headerLeft}</>)

    const switcherButton = screen.getByLabelText("library.allLibraries")
    expect(screen.queryByText("library.allLibraries")).toBeNull()
    expect(switcherButton.props.color).toBeUndefined()
    fireEvent.press(switcherButton)

    const { router } = jest.requireMock("expo-router")
    expect(router.push).toHaveBeenCalledWith("/switch-library")
  })
})
