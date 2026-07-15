import { act, render, screen } from "@testing-library/react-native"

import type { ReaderSettingsSheetRef } from "./ReaderSettingsSheetContainer.types"

const mockReact = jest.requireActual<typeof import("react")>("react")
let mockIsPad = false

jest.doMock("react", () => mockReact)

jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native")
  return new Proxy(actual, {
    get(target, property) {
      if (property === "Platform") {
        return { ...target.Platform, isPad: mockIsPad }
      }
      return target[property]
    },
  })
})

jest.mock("@expo/ui/community/bottom-sheet", () => {
  const mockReact = jest.requireMock<typeof import("react")>("react")
  const mockReactNative = jest.requireActual("react-native")

  return {
    BottomSheetModal: mockReact.forwardRef(function BottomSheetModalMock(
      {
        children,
        onDismiss,
        ...props
      }: {
        children: React.ReactNode
        onDismiss?: () => void
      },
      ref: React.Ref<unknown>,
    ) {
      const [presented, setPresented] = mockReact.useState(false)
      mockReact.useImperativeHandle(
        ref,
        () => ({
          present: () => setPresented(true),
          dismiss: () => {
            setPresented(false)
            onDismiss?.()
          },
        }),
        [onDismiss],
      )

      if (!presented) return null
      return mockReact.createElement(
        mockReactNative.View,
        { ...props, testID: "ipad-settings-native-sheet" },
        children,
      )
    }),
  }
})

jest.mock("@expo/ui/swift-ui", () => {
  const mockReact = jest.requireMock<typeof import("react")>("react")
  const mockReactNative = jest.requireActual("react-native")
  const view = (testID: string) =>
    function MockView({ children, ...props }: { children: React.ReactNode }) {
      return mockReact.createElement(
        mockReactNative.View,
        { ...props, testID },
        children,
      )
    }

  return {
    BottomSheet: view("ios-settings-native-sheet"),
    Group: view("ios-settings-presentation-group"),
    Host: view("ios-settings-host"),
    RNHostView: view("ios-settings-rn-host"),
  }
})

jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  presentationBackground: jest.fn((value: string) => ({
    type: "presentationBackground",
    value,
  })),
  presentationDetents: jest.fn((value: unknown) => ({
    type: "presentationDetents",
    value,
  })),
  presentationDragIndicator: jest.fn((value: string) => ({
    type: "presentationDragIndicator",
    value,
  })),
}))

function loadContainer(isPad: boolean) {
  mockIsPad = isPad

  let Container!: typeof import("./ReaderSettingsSheetContainer.ios").default
  jest.isolateModules(() => {
    Container = jest.requireActual<
      typeof import("./ReaderSettingsSheetContainer.ios")
    >("./ReaderSettingsSheetContainer.ios").default
  })

  return Container
}

describe("ReaderSettingsSheetContainer on iOS", () => {
  it("should_preserve_half_height_native_sheet_when_running_on_iphone", () => {
    const ReaderSettingsSheetContainer = loadContainer(false)
    const ref = mockReact.createRef<ReaderSettingsSheetRef>()
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

    expect(
      screen.getByTestId("ios-settings-native-sheet").props.isPresented,
    ).toBe(false)

    act(() => ref.current?.present())

    expect(
      screen.getByTestId("ios-settings-native-sheet").props.isPresented,
    ).toBe(true)
    expect(
      screen.getByTestId("ios-settings-presentation-group").props.modifiers,
    ).toEqual([
      { type: "presentationDetents", value: [{ fraction: 0.5 }] },
      { type: "presentationDragIndicator", value: "visible" },
      { type: "presentationBackground", value: "#F7F3EC" },
    ])

    act(() =>
      screen
        .getByTestId("ios-settings-native-sheet")
        .props.onIsPresentedChange(false),
    )

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("should_use_navigation_sized_native_sheet_when_running_on_ipad", () => {
    const ReaderSettingsSheetContainer = loadContainer(true)
    const ref = mockReact.createRef<ReaderSettingsSheetRef>()
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

    expect(screen.queryByTestId("ipad-settings-native-sheet")).toBeNull()

    act(() => ref.current?.present())

    expect(screen.getByTestId("ipad-settings-native-sheet").props).toEqual(
      expect.objectContaining({
        backgroundStyle: { backgroundColor: "#F7F3EC" },
        enableDynamicSizing: false,
        enablePanDownToClose: true,
        index: 0,
        snapPoints: ["100%"],
      }),
    )
    expect(screen.queryByTestId("ios-settings-native-sheet")).toBeNull()

    act(() => ref.current?.dismiss())

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId("ipad-settings-native-sheet")).toBeNull()
  })
})
