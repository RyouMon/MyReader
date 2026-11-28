import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native"
import type { ReactNode } from "react"
import { Platform } from "react-native"
import ModelDiscoveryScreen from "./model-discovery-screen"
import {
  closeModelDiscovery,
  openModelDiscovery,
  useModelDiscoveryStore,
} from "./model-discovery-session"

const mockScreenOptions = jest.fn()
const mockRedirect = jest.fn()

jest.mock("@expo/material-symbols/check.xml", () => ({ uri: "check" }))
jest.mock("@expo/material-symbols/close.xml", () => ({ uri: "close" }))
jest.mock("@expo/vector-icons/MaterialIcons", () => "Icon")

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
    disabled,
    onPress,
    children,
  }: {
    accessibilityLabel: string
    disabled?: boolean
    onPress?: () => void
    children?: ReactNode
  }) {
    return React.createElement(
      ReactNative.Pressable,
      {
        accessibilityLabel,
        accessibilityRole: "button",
        accessibilityState: { disabled: Boolean(disabled) },
        disabled,
        onPress,
      },
      children,
    )
  }

  Toolbar.Icon = function ToolbarIcon({ sf }: { sf: string }) {
    return React.createElement(ReactNative.Text, { testID: `sf-${sf}` }, sf)
  }

  return {
    Redirect: ({ href }: { href: string }) => {
      mockRedirect(href)
      return React.createElement(ReactNative.Text, null, `redirect:${href}`)
    },
    router: {
      back: jest.fn(),
      canGoBack: jest.fn(() => true),
      push: jest.fn(),
      replace: jest.fn(),
    },
    Stack: {
      Screen: ({ options }: { options?: unknown }) => {
        mockScreenOptions(options)
        return null
      },
      Toolbar,
    },
  }
})

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

jest.mock("@/src/components/ui/android-header-icon-button", () => ({
  AndroidHeaderIconButton: ({
    accessibilityLabel,
    disabled,
    loading,
    onPress,
    testID,
  }: {
    accessibilityLabel: string
    disabled?: boolean
    loading?: boolean
    onPress: () => void
    testID?: string
  }) => {
    const React = jest.requireActual<typeof import("react")>("react")
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native")
    return React.createElement(ReactNative.Pressable, {
      accessibilityLabel,
      accessibilityRole: "button",
      accessibilityState: {
        disabled: Boolean(disabled || loading),
        busy: Boolean(loading),
      },
      disabled: Boolean(disabled || loading),
      onPress,
      testID,
    })
  },
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    text: "#222",
    textMuted: "#666",
    primary: "#c4622d",
    danger: "#b42318",
    surface: "#fff",
    background: "#f8f4ee",
    backgroundSecondary: "#efe8de",
    border: "#ddd",
    borderStrong: "#bbb",
  }),
}))

jest.mock("@/src/i18n/error-message", () => ({
  errorMessage: (error: Error) => error.message,
}))

describe("ModelDiscoveryScreen", () => {
  const initialPlatform = Platform.OS

  beforeEach(() => {
    jest.clearAllMocks()
    closeModelDiscovery()
  })

  afterEach(() => {
    closeModelDiscovery()
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: initialPlatform,
    })
  })

  it("redirects safely when opened without an active session", () => {
    render(<ModelDiscoveryScreen />)

    expect(mockRedirect).toHaveBeenCalledWith("/settings")
  })

  it("uses native iOS toolbar actions, supports select-all/deselect-all, and submits selected IDs", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    })
    const onAdd = jest.fn()
    const onClose = jest.fn()
    openModelDiscovery({
      models: [{ id: "existing-model" }, { id: "new-a" }, { id: "new-b" }],
      existing: ["existing-model"],
      onAdd,
      onClose,
    })

    const { router } = jest.requireMock("expo-router")
    expect(router.push).toHaveBeenCalledWith("/model-discovery")

    render(<ModelDiscoveryScreen />)

    expect(screen.getByTestId("model-discovery-sheet")).toBeTruthy()
    expect(screen.queryByLabelText("providerEditor.searchModels")).toBeNull()
    expect(screen.queryByText("common.cancel")).toBeNull()
    expect(screen.getByText("existing-model")).toBeTruthy()
    expect(screen.getByText("providerEditor.modelAdded")).toBeTruthy()
    expect(
      screen.queryByRole("checkbox", { name: "existing-model" }),
    ).toBeNull()

    const confirmButton = within(screen.getByTestId("toolbar-right")).getByRole(
      "button",
      { name: "providerEditor.addSelected" },
    )
    expect(confirmButton.props.accessibilityState.disabled).toBe(true)

    fireEvent.press(screen.getByText("common.selectAll"))
    expect(
      screen.getByText('providerEditor.selectedCount:{"count":2}'),
    ).toBeTruthy()
    expect(screen.getByText("common.deselectAll")).toBeTruthy()
    expect(confirmButton.props.accessibilityState.disabled).toBe(false)

    fireEvent.press(screen.getByText("common.deselectAll"))
    expect(screen.getByText("common.selectAll")).toBeTruthy()
    expect(confirmButton.props.accessibilityState.disabled).toBe(true)

    fireEvent.press(screen.getByRole("checkbox", { name: "new-a" }))
    fireEvent.press(screen.getByRole("checkbox", { name: "new-b" }))
    expect(screen.getByText("common.deselectAll")).toBeTruthy()

    await act(async () => {
      fireEvent.press(confirmButton)
    })
    expect(onAdd).toHaveBeenCalledWith(["new-a", "new-b"])
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(useModelDiscoveryStore.getState().session).toBeNull()
  })

  it("closes cleanly via the native iOS close toolbar button without calling onAdd", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    })
    const onAdd = jest.fn()
    const onClose = jest.fn()
    openModelDiscovery({
      models: [{ id: "only-existing" }],
      existing: ["only-existing"],
      onAdd,
      onClose,
    })

    render(<ModelDiscoveryScreen />)

    expect(screen.getByText("providerEditor.noNewModels")).toBeTruthy()
    expect(screen.queryByText("common.selectAll")).toBeNull()

    const closeButton = within(screen.getByTestId("toolbar-left")).getByRole(
      "button",
      { name: "common.close" },
    )
    fireEvent.press(closeButton)

    const { router } = jest.requireMock("expo-router")
    expect(onAdd).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(router.back).toHaveBeenCalledTimes(1)
  })

  it("uses Android form-sheet header actions, scopes select-all to filtered results, and keeps selections on error", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    })
    let rejectFirst!: (error: Error) => void
    const onAdd = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirst = reject
          }),
      )
      .mockResolvedValueOnce(true)

    const models = Array.from({ length: 9 }, (_, i) => ({
      id: i === 0 ? "speech-hd" : `model-${i}`,
    }))
    openModelDiscovery({
      models,
      existing: [],
      onAdd,
    })

    render(<ModelDiscoveryScreen />)

    expect(
      screen.getByRole("header", { name: "providerEditor.selectModels" }),
    ).toBeTruthy()

    const search = screen.getByLabelText("providerEditor.searchModels")
    fireEvent.press(screen.getByRole("checkbox", { name: "speech-hd" }))
    fireEvent.changeText(search, "model-8")
    expect(screen.queryByRole("checkbox", { name: "speech-hd" })).toBeNull()

    fireEvent.press(screen.getByText("common.selectAll"))
    expect(
      screen.getByText('providerEditor.selectedCount:{"count":2}'),
    ).toBeTruthy()
    expect(screen.getByText("common.deselectAll")).toBeTruthy()

    fireEvent.changeText(search, "missing")
    expect(screen.getByText("providerEditor.noMatchingModels")).toBeTruthy()
    expect(screen.queryByText("common.selectAll")).toBeNull()

    const confirmButton = screen.getByTestId("model-discovery-confirm-button")
    fireEvent.press(confirmButton)
    expect(confirmButton.props.accessibilityState.busy).toBe(true)

    await act(async () => {
      rejectFirst(new Error("import failed"))
    })
    await screen.findByText("import failed")
    const { router } = jest.requireMock("expo-router")
    expect(router.back).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.press(confirmButton)
    })
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1))
    expect(onAdd).toHaveBeenLastCalledWith(["speech-hd", "model-8"])
  })
})
