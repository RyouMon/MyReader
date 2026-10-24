import { fireEvent, render } from "@testing-library/react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"

import ReaderRoute from "@/src/app/reader/[id]"

jest.mock("./reader-screen", () => {
  const React = jest.requireActual("react")
  const { View } = jest.requireActual("react-native")
  const { useSafeAreaInsets } = jest.requireActual(
    "react-native-safe-area-context",
  )
  return function ReaderChromeProbe() {
    return React.createElement(View, {
      testID: "reader-chrome",
      accessibilityValue: { now: useSafeAreaInsets().top },
    })
  }
})

it("keeps modal controls clear of the status bar when the background screen loses its inset", () => {
  const frame = { x: 0, y: 0, width: 834, height: 1194 }
  const visible = { top: 32, bottom: 20, left: 0, right: 0 }
  const hidden = { ...visible, top: 0 }
  const screen = render(
    <SafeAreaProvider initialMetrics={{ frame, insets: visible }}>
      <ReaderRoute />
    </SafeAreaProvider>,
  )
  const providers = screen.root.findAll(
    (node) =>
      typeof node.type === "string" &&
      typeof node.props.onInsetsChange === "function",
  )
  const modal = providers[providers.length - 1]!
  fireEvent(modal, "insetsChange", {
    nativeEvent: { frame, insets: visible },
  })
  fireEvent(providers[0]!, "insetsChange", {
    nativeEvent: { frame, insets: hidden },
  })
  expect(screen.getByTestId("reader-chrome").props.accessibilityValue.now).toBe(
    visible.top,
  )
  fireEvent(modal, "insetsChange", {
    nativeEvent: { frame, insets: hidden },
  })
  expect(screen.getByTestId("reader-chrome").props.accessibilityValue.now).toBe(
    hidden.top,
  )
  fireEvent(modal, "insetsChange", {
    nativeEvent: { frame, insets: visible },
  })
  expect(screen.getByTestId("reader-chrome").props.accessibilityValue.now).toBe(
    visible.top,
  )
})
