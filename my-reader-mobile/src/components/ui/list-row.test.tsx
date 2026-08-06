import { render } from "@testing-library/react-native"
import { Platform } from "react-native"

import { ListRow } from "./list-row"

jest.mock("@expo/vector-icons/MaterialIcons", () => jest.fn(() => null))

jest.mock("@expo/ui/jetpack-compose", () => ({
  Host: ({ children }: { children: React.ReactNode }) => children,
  Icon: jest.fn(() => null),
}))

jest.mock("expo-symbols", () => ({
  SymbolView: jest.fn(() => null),
}))

jest.mock("@react-native-menu/menu", () => ({
  MenuView: jest.fn(() => null),
}))

jest.mock("@/src/design/tokens", () => {
  const palette = {
    borderStrong: "#d9cebb",
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
})
