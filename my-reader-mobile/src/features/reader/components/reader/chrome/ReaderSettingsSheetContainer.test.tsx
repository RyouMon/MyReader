import { createRef } from "react"
import { act, render, screen } from "@testing-library/react-native"

import ReaderSettingsSheetContainer from "./ReaderSettingsSheetContainer.android"
import type { ReaderSettingsSheetRef } from "./ReaderSettingsSheetContainer.types"

jest.mock("@expo/ui/jetpack-compose", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    Column: ({ children, ...props }: { children: React.ReactNode }) =>
      mockReact.createElement(
        mockReactNative.View,
        { ...props, testID: "android-settings-height-container" },
        children,
      ),
    Host: ({ children }: { children: React.ReactNode }) =>
      mockReact.createElement(mockReactNative.View, null, children),
    ModalBottomSheet: mockReact.forwardRef(function ModalBottomSheetMock(
      { children, ...props }: { children: React.ReactNode },
      _ref: React.Ref<unknown>,
    ) {
      return mockReact.createElement(
        mockReactNative.View,
        { ...props, testID: "android-settings-native-sheet" },
        children,
      )
    }),
    RNHostView: ({ children, ...props }: { children: React.ReactNode }) =>
      mockReact.createElement(
        mockReactNative.View,
        { ...props, testID: "android-settings-rn-host" },
        children,
      ),
  }
})

jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  height: jest.fn((value: number) => ({ type: "height", value })),
}))

describe("ReaderSettingsSheetContainer on Android", () => {
  it("should present at a fixed half-screen height while preserving native dismissal", () => {
    const ref = createRef<ReaderSettingsSheetRef>()
    const onDismiss = jest.fn()

    render(
      <ReaderSettingsSheetContainer
        ref={ref}
        backgroundColor="#F7F3EC"
        onDismiss={onDismiss}
      >
        <></>
      </ReaderSettingsSheetContainer>,
    )

    expect(screen.queryByTestId("android-settings-native-sheet")).toBeNull()

    act(() => ref.current?.present())

    expect(screen.getByTestId("android-settings-native-sheet").props).toEqual(
      expect.objectContaining({
        initialFullyExpanded: false,
        sheetGesturesEnabled: true,
        skipPartiallyExpanded: true,
      }),
    )
    const heightContainer = screen.getByTestId(
      "android-settings-height-container",
    )
    expect(heightContainer.props.modifiers).toEqual([
      expect.objectContaining({ type: "height", value: expect.any(Number) }),
    ])
    expect(heightContainer.props.modifiers[0].value).toBeGreaterThan(0)
    expect(
      screen.getByTestId("android-settings-rn-host").props.modifiers,
    ).toBeUndefined()

    act(() =>
      screen
        .getByTestId("android-settings-native-sheet")
        .props.onDismissRequest(),
    )

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId("android-settings-native-sheet")).toBeNull()
  })
})
