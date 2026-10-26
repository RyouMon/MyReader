import { act, render, screen } from "@testing-library/react-native"
import { Platform } from "react-native"

import { ListMenuRow, ListRow } from "./list-row"

jest.mock("@expo/vector-icons/MaterialIcons", () => jest.fn(() => null))

jest.mock("@expo/ui/jetpack-compose", () => ({
  Host: ({ children }: { children: React.ReactNode }) => children,
  Icon: jest.fn(() => null),
}))

jest.mock("expo-symbols", () => ({
  SymbolView: jest.fn(() => null),
}))

jest.mock("./ios-select-menu", () => ({
  IosSelectMenu: jest.fn(({ children }) => children),
}))

jest.mock("@react-native-menu/menu", () => ({
  MenuView: jest.fn(() => null),
}))

jest.mock("@/src/design/tokens", () => {
  const palette = {
    borderStrong: "#d9cebb",
    brandOnedrive: "#0078d4",
    dataSourceWebdav: "#0f766e",
    primary: "#b5651d",
    surface: "#faf5ef",
    text: "#3b2f2f",
    textMuted: "#7a6b5d",
  }

  return {
    useTheme: () => ({ colorScheme: "light", palette }),
    useThemePalette: () => palette,
  }
})

describe("ListRow", () => {
  const initialPlatform = Platform.OS

  afterEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: initialPlatform,
    })
  })

  it("passes selection and disabled states to the native iOS menu and forwards its action", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" })
    const onPressAction = jest.fn()
    const actions = [
      { id: "current", title: "Current model", state: "on" as const },
      { id: "disabled", title: "Unavailable", attributes: { disabled: true } },
    ]
    render(
      <ListMenuRow
        title="Model"
        actions={actions}
        onPressAction={onPressAction}
      />,
    )
    expect(screen.getByRole("button", { name: "Model" })).toBeTruthy()
    const { IosSelectMenu } = jest.requireMock("./ios-select-menu")
    const props = IosSelectMenu.mock.calls[0][0]
    expect(props.actions).toEqual(actions)
    act(() => props.onSelect("current"))
    expect(onPressAction).toHaveBeenCalledTimes(1)
    expect(onPressAction).toHaveBeenCalledWith({
      nativeEvent: { event: "current" },
    })
  })

  it("should use theme color when an iOS row has an icon", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    })

    render(
      <ListRow
        title="Favorites"
        icon={{ ios: "heart.fill", android: "favorite" }}
      />,
    )

    const { SymbolView } = jest.requireMock("expo-symbols")
    expect(SymbolView.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ tintColor: "#b5651d" }),
    )
  })

  it("should use theme color when an Android row has an icon", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    })

    render(
      <ListRow
        title="Favorites"
        icon={{ ios: "heart.fill", android: "favorite" }}
      />,
    )

    const MaterialIcons = jest.requireMock("@expo/vector-icons/MaterialIcons")
    expect(MaterialIcons.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ color: "#b5651d" }),
    )
  })

  it("should use OneDrive blue when a row has a OneDrive icon", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    })

    render(
      <ListRow
        title="OneDrive"
        icon={{ ios: "cloud.fill", android: "cloud", tone: "onedrive" }}
      />,
    )

    const { SymbolView } = jest.requireMock("expo-symbols")
    expect(SymbolView.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ tintColor: "#0078d4" }),
    )
  })

  it("should use WebDAV teal for a filled server icon", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    })

    render(
      <ListRow
        title="WebDAV"
        icon={{
          ios: "dns",
          android: "dns",
          iconSet: "material",
          tone: "webdav",
        }}
      />,
    )

    const MaterialIcons = jest.requireMock("@expo/vector-icons/MaterialIcons")
    expect(MaterialIcons.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ name: "dns", color: "#0f766e" }),
    )
  })
})
