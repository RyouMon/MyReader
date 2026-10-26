import {
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react-native"
import { Platform } from "react-native"
import { useScreenHeader } from "./use-screen-header"

const mockRouter = {
  canGoBack: jest.fn(() => true),
  dismiss: jest.fn(),
  dismissTo: jest.fn(),
  replace: jest.fn(),
}
jest.mock("expo-router", () => ({
  router: {
    canGoBack: () => mockRouter.canGoBack(),
    dismiss: () => mockRouter.dismiss(),
    dismissTo: (route: string) => mockRouter.dismissTo(route),
    replace: (route: string) => mockRouter.replace(route),
  },
}))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@/src/components/ui/header-toolbar", () => ({
  HeaderToolbar: () => null,
}))
jest.mock("@/src/components/ui/button", () => ({
  HeaderCloseButton: () => null,
}))
jest.mock("@/src/components/ui/header-toolbar.android", () => {
  const React = jest.requireActual("react")
  const { Pressable } = jest.requireActual("react-native")
  return {
    buildAndroidHeaderToolbarNavigationOptions: ({
      hasLeft,
      renderLeft,
    }: any) =>
      hasLeft ? { headerLeft: renderLeft, headerBackVisible: false } : {},
    renderHeaderToolbarActions: (actions: any[]) =>
      actions.map((action) =>
        React.createElement(Pressable, {
          key: action.label,
          accessibilityLabel: action.label,
          onPress: action.onPress,
        }),
      ),
  }
})

const originalPlatform = Platform.OS
afterEach(() => {
  jest.clearAllMocks()
  mockRouter.canGoBack.mockReturnValue(true)
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: originalPlatform,
  })
})

it("uses a screen-local close control on iOS and leaves subpages to native stack back", () => {
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" })
  const root = renderHook(() =>
    useScreenHeader({ close: { variant: "layout" } }),
  ).result.current
  expect(root.options.headerLeft).toEqual(expect.any(Function))
  expect(root.options.headerBackVisible).toBe(false)
  expect(root.toolbar).toBeNull()
  const child = renderHook(() => useScreenHeader({})).result.current
  expect(child.options.headerLeft).toBeUndefined()
  expect(child.options.headerBackVisible).toBe(true)
  expect(child.toolbar).toBeNull()
})

it("shows Close on an Android sheet root, dismisses to its caller, and preserves child back", () => {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "android",
  })
  const { result } = renderHook(() =>
    useScreenHeader({ close: { variant: "layout" } }),
  )
  const view = render(
    <>{result.current.options.headerLeft?.({ canGoBack: true } as never)}</>,
  )
  fireEvent.press(screen.getByLabelText("common.close"))
  expect(mockRouter.dismiss).toHaveBeenCalledTimes(1)
  expect(result.current.options.headerBackVisible).toBe(false)
  mockRouter.canGoBack.mockReturnValue(false)
  fireEvent.press(view.getByLabelText("common.close"))
  expect(mockRouter.replace).toHaveBeenCalledWith("/settings")
  const child = renderHook(() => useScreenHeader({})).result.current
  expect(child.options.headerLeft).toBeUndefined()
})

it("honors an explicit close destination on Android", () => {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "android",
  })
  const { result } = renderHook(() =>
    useScreenHeader({ close: { target: "/settings", dismissTo: true } }),
  )
  render(
    <>{result.current.options.headerLeft?.({ canGoBack: true } as never)}</>,
  )
  fireEvent.press(screen.getByLabelText("common.close"))
  expect(mockRouter.dismissTo).toHaveBeenCalledWith("/settings")
  expect(mockRouter.dismiss).not.toHaveBeenCalled()
})
