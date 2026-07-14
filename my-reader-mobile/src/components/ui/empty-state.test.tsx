import { render } from "@testing-library/react-native"
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native"

import { EmptyState } from "./empty-state"

jest.mock("@expo/vector-icons/MaterialIcons", () => jest.fn(() => null))

jest.mock("@/tw", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    Text: mockReactNative.Text,
    View: jest.fn(({ children, ...props }) =>
      mockReact.createElement(mockReactNative.View, props, children),
    ),
  }
})

jest.mock("expo-symbols", () => ({
  SymbolView: jest.fn(() => null),
}))

jest.mock("expo-router/react-navigation", () => ({
  useHeaderHeight: () => 44,
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    border: "#333333",
    text: "#ffffff",
    textMuted: "#999999",
  }),
}))

describe("EmptyState", () => {
  it("should defer vertical sizing to the parent when used in a container", () => {
    render(<EmptyState title="暂无书签" detail="详情" layout="container" />)

    const { View } = jest.requireMock("@/tw")
    const rootProps = View.mock.calls.find(
      ([props]: [{ style?: StyleProp<ViewStyle> }]) =>
        StyleSheet.flatten(props.style)?.minHeight !== undefined,
    )?.[0]
    expect(StyleSheet.flatten(rootProps?.style)).toEqual(
      expect.objectContaining({ minHeight: 0 }),
    )
  })
})
