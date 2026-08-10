import { render } from "@testing-library/react-native"
import {
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native"

import { EmptyState } from "./empty-state"

jest.mock("@expo/vector-icons/MaterialIcons", () => jest.fn(() => null))

jest.mock("@expo/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react")
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native")

  return {
    Host: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, { testID: "compose-host" }, children),
    Icon: () => React.createElement(View, { testID: "compose-icon" }),
  }
})

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
    brandOnedrive: "#0078d4",
    dataSourceWebdav: "#0f766e",
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

  it("should use supplied colors when a containing surface owns the theme", () => {
    const screen = render(
      <EmptyState
        title="暂无书签"
        detail="详情"
        colors={{
          icon: "#123456",
          title: "#234567",
          detail: "#345678",
        }}
      />,
    )

    expect(
      StyleSheet.flatten(screen.getByText("暂无书签").props.style),
    ).toEqual(expect.objectContaining({ color: "#234567" }))
    expect(StyleSheet.flatten(screen.getByText("详情").props.style)).toEqual(
      expect.objectContaining({ color: "#345678" }),
    )
  })

  it("should allow a screen to use standard title text sizing", () => {
    const screen = render(
      <EmptyState
        title="尚未选择书库"
        detail="请选择书库"
        titleClassName="text-base"
      />,
    )

    expect(screen.getByText("尚未选择书库").props.className).toBe(
      "text-center text-base",
    )
  })

  it("should render an Android XML icon directly inside a Compose Host", () => {
    const initialPlatform = Platform.OS
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    })

    try {
      const screen = render(
        <EmptyState
          title="暂无高亮和笔记"
          detail="详情"
          layout="container"
          icon={{ ios: "square.and.pencil", android: { uri: "edit-square" } }}
        />,
      )

      const host = screen.getByTestId("compose-host")
      const { Icon } = jest.requireMock("@expo/ui")
      const icon = screen.UNSAFE_getByType(Icon)
      expect(host.children).toContain(icon)
    } finally {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: initialPlatform,
      })
    }
  })

  it("should use OneDrive blue for a branded cloud icon", () => {
    const initialPlatform = Platform.OS
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    })

    try {
      render(
        <EmptyState
          title="OneDrive"
          detail="详情"
          icon={{ ios: "cloud.fill", android: "cloud", tone: "onedrive" }}
        />,
      )

      const { SymbolView } = jest.requireMock("expo-symbols")
      expect(SymbolView.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({
          name: "cloud.fill",
          tintColor: "#0078d4",
        }),
      )
    } finally {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: initialPlatform,
      })
    }
  })

  it("should use WebDAV teal for a filled server icon", () => {
    const initialPlatform = Platform.OS
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    })

    try {
      render(
        <EmptyState
          title="WebDAV"
          detail="详情"
          icon={{
            ios: "dns",
            android: "dns",
            iconSet: "material",
            tone: "webdav",
          }}
        />,
      )

      const MaterialIcons = jest.requireMock("@expo/vector-icons/MaterialIcons")
      expect(MaterialIcons.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({ name: "dns", color: "#0f766e" }),
      )
    } finally {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: initialPlatform,
      })
    }
  })
})
