import { render } from "@testing-library/react-native"
import { Platform } from "react-native"

import { ReaderChromeIcon } from "./ReaderChromeIcon"

jest.mock("@expo/material-symbols/edit_square.xml", () => ({
  uri: "edit-square-outline",
}))

jest.mock("@expo/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react")
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native")

  return {
    Host: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, { testID: "compose-host" }, children),
    Icon: ({ name }: { name: unknown }) =>
      React.createElement(View, {
        testID: "compose-icon",
        accessibilityLabel: JSON.stringify(name),
      }),
  }
})

jest.mock("@expo/vector-icons/MaterialIcons", () => jest.fn(() => null))
jest.mock("expo-symbols", () => ({ SymbolView: jest.fn(() => null) }))

describe("ReaderChromeIcon", () => {
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

  it("should render an Android XML icon directly inside a Compose Host", () => {
    const screen = render(
      <ReaderChromeIcon name="annotations" size={24} color="#123456" />,
    )

    const host = screen.getByTestId("compose-host")
    const { Icon } = jest.requireMock("@expo/ui")
    const icon = screen.UNSAFE_getByType(Icon)
    expect(host.children).toContain(icon)
  })

  it("should use the outlined Android annotation icon", () => {
    const screen = render(
      <ReaderChromeIcon name="annotations" size={24} color="#123456" />,
    )

    expect(
      screen.getByLabelText(JSON.stringify({ uri: "edit-square-outline" })),
    ).toBeTruthy()
  })
})
