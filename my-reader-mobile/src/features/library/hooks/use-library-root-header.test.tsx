import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native"
import type { ReactNode } from "react"
import { Platform, View } from "react-native"

import { useLibraryRootHeader } from "./use-library-root-header"

const mockSyncPress = jest.fn()
let mockSyncLabel = "Sync status: Idle"
let mockStore = {
  storeReady: true,
  activeLibraryId: "library-1" as string | null,
  libraries: [{ id: "library-1", name: "My Library" }],
}

jest.mock("@expo/material-symbols/cards_stack.xml", () => ({
  uri: "cards-stack",
}))
jest.mock("expo-router", () => {
  const React = jest.requireActual<typeof import("react")>("react")
  const Native =
    jest.requireActual<typeof import("react-native")>("react-native")
  function Toolbar({
    children,
    placement,
  }: {
    children: ReactNode
    placement: string
  }) {
    return React.createElement(
      Native.View,
      { testID: `toolbar-${placement}` },
      children,
    )
  }
  Toolbar.Button = ({
    children,
    accessibilityLabel,
    disabled,
    onPress,
  }: {
    children?: ReactNode
    accessibilityLabel: string
    disabled?: boolean
    onPress: () => void
  }) =>
    React.createElement(
      Native.Pressable,
      {
        accessibilityLabel,
        accessibilityRole: "button",
        accessibilityState: { disabled },
        disabled,
        onPress,
      },
      React.createElement(Native.Text, null, children),
    )
  Toolbar.Icon = () => null
  Toolbar.Label = Native.Text
  return { router: { push: jest.fn() }, Stack: { Toolbar } }
})
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@/src/store/app-store", () => ({
  useAppStore: (selector: (state: typeof mockStore) => unknown) =>
    selector(mockStore),
}))
jest.mock("@/src/components/ui/android-header-icon-button", () => ({
  AndroidHeaderIconButton: ({
    accessibilityLabel,
    disabled,
    loading,
    onPress,
  }: {
    accessibilityLabel: string
    disabled?: boolean
    loading?: boolean
    onPress: () => void
  }) => {
    const React = jest.requireActual<typeof import("react")>("react")
    const Native =
      jest.requireActual<typeof import("react-native")>("react-native")
    return React.createElement(Native.Pressable, {
      accessibilityLabel,
      accessibilityRole: "button",
      accessibilityState: { disabled: disabled || loading },
      disabled: disabled || loading,
      onPress,
    })
  },
}))
jest.mock("@/src/components/ui/header-toolbar-material-icons.android", () => ({
  resolveToolbarMaterialIcon: () => ({ uri: "icon" }),
}))
jest.mock("@/src/components/ui/round-icon-button", () => ({
  RoundIconButton: () => null,
}))
jest.mock("@/src/components/ui/button", () => ({
  HeaderCloseButton: () => null,
}))
jest.mock("@/src/components/ui/header-toolbar", () =>
  jest.requireActual("@/src/components/ui/header-toolbar.ios"),
)
jest.mock("@/src/features/sync/hooks/use-sync-status-header-action", () => ({
  useSyncStatusHeaderAction: () => ({
    label: mockSyncLabel,
    onPress: mockSyncPress,
    iosSfSymbol: "icloud",
    iconOnly: true,
  }),
}))

function RootHeader({ title = "Home" }: { title?: string }) {
  const { options, toolbar } = useLibraryRootHeader(title)
  return (
    <>
      {Platform.OS === "android" ? (
        <>
          <View testID="toolbar-left">
            {options.headerLeft?.({ canGoBack: false })}
          </View>
          <View testID="toolbar-right">
            {options.headerRight?.({ canGoBack: false })}
          </View>
        </>
      ) : (
        toolbar
      )}
    </>
  )
}

const initialPlatform = Platform.OS

afterAll(() => {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: initialPlatform,
  })
})

describe.each(["ios", "android"])("library root header on %s", (platform) => {
  beforeEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: platform,
    })
    jest.clearAllMocks()
    mockStore = {
      storeReady: true,
      activeLibraryId: "library-1",
      libraries: [{ id: "library-1", name: "My Library" }],
    }
    mockSyncLabel = "Sync status: Idle"
  })

  it.each([
    "Home",
    "My Library",
  ])("exposes the same navigation actions for %s", (title) => {
    render(<RootHeader title={title} />)
    const left = within(screen.getByTestId("toolbar-left"))
    const right = within(screen.getByTestId("toolbar-right"))
    expect(
      left
        .getAllByRole("button")
        .map((button) => button.props.accessibilityLabel),
    ).toEqual(["library.allLibraries"])
    expect(
      right
        .getAllByRole("button")
        .map((button) => button.props.accessibilityLabel),
    ).toEqual(["common.search", "Sync status: Idle"])

    fireEvent.press(left.getByRole("button", { name: "library.allLibraries" }))
    fireEvent.press(right.getByRole("button", { name: "common.search" }))
    fireEvent.press(right.getByRole("button", { name: "Sync status: Idle" }))
    const { router } = jest.requireMock("expo-router")
    expect(router.push).toHaveBeenNthCalledWith(1, "/switch-library")
    expect(router.push).toHaveBeenNthCalledWith(2, {
      pathname: "/library/catalog",
      params: { search: "1" },
    })
    expect(mockSyncPress).toHaveBeenCalledTimes(1)
  })

  it.each([
    "loading",
    "empty",
    "unselected",
    "invalid",
  ])("keeps switching and sync available but disables search when %s", (state) => {
    if (state === "loading") mockStore.storeReady = false
    if (state === "empty") mockStore.libraries = []
    if (state === "unselected") mockStore.activeLibraryId = null
    if (state === "invalid") mockStore.activeLibraryId = "missing"
    render(<RootHeader />)
    const search = screen.getByRole("button", { name: "common.search" })
    expect(search).toBeDisabled()
    fireEvent.press(search)
    const { router } = jest.requireMock("expo-router")
    expect(router.push).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", { name: "library.allLibraries" }),
    ).toBeEnabled()
    expect(
      screen.getByRole("button", { name: "Sync status: Idle" }),
    ).toBeEnabled()
  })

  it("updates availability and sync status after the active library changes", () => {
    mockStore.storeReady = false
    const { rerender } = render(<RootHeader />)
    mockStore.storeReady = true
    mockStore.libraries = [{ id: "library-2", name: "" }]
    mockStore.activeLibraryId = "library-2"
    mockSyncLabel = "Sync status: Syncing"
    rerender(<RootHeader />)
    expect(screen.getByRole("button", { name: "common.search" })).toBeEnabled()
    expect(
      screen.getByRole("button", { name: "Sync status: Syncing" }),
    ).toBeEnabled()
    expect(
      screen.queryByRole("button", { name: "Sync status: Idle" }),
    ).toBeNull()
  })
})
