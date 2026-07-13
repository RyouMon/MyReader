import { render, screen } from "@testing-library/react-native"
import { Platform, processColor } from "react-native"

import { AndroidHeaderIconButton } from "./android-header-icon-button"

jest.mock("@expo/ui/jetpack-compose", () => {
  const React = jest.requireActual<typeof import("react")>("react")
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native")

  return {
    CircularProgressIndicator: () => React.createElement(View),
    Host: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
    Icon: () => React.createElement(View),
    IconButton: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  }
})

jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  size: jest.fn(),
}))

jest.mock("@/src/design/tokens", () => ({
  useTheme: () => ({
    colorScheme: "light",
    palette: {
      text: "#3b2f2f",
      textMuted: "#7a6b5d",
    },
  }),
}))

describe("AndroidHeaderIconButton", () => {
  const initialPlatform = Platform.OS

  beforeEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    })
  })

  afterAll(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: initialPlatform,
    })
  })

  it("should show a bounded ripple over the requested background", () => {
    render(
      <AndroidHeaderIconButton
        accessibilityLabel="Back"
        backgroundColor="rgba(0,0,0,0.65)"
        icon={{ uri: "back" }}
        onPress={jest.fn()}
        rippleColor="rgba(255,255,255,0.22)"
      />,
    )

    const button = screen.getByRole("button")
    expect(button.props.nativeBackgroundAndroid).toEqual({
      borderless: false,
      color: processColor("rgba(255,255,255,0.22)"),
      rippleRadius: 24,
      type: "RippleAndroid",
    })
    expect(button.props.style).toMatchObject({
      backgroundColor: "rgba(0,0,0,0.65)",
      borderRadius: 24,
      height: 48,
      overflow: "hidden",
      width: 48,
    })
  })
})
