import { act, render } from "@testing-library/react-native"
import { AppState } from "react-native"
import { AppUpdateRuntime } from "./app-update-runtime"
import { AppUpdateSection } from "./app-update-section"
import { useAppUpdate } from "./use-app-update"
import { Platform } from "react-native"

jest.mock("./use-app-update", () => ({ useAppUpdate: jest.fn() }))
jest.mock("react-native-notifier", () => ({
  Notifier: { showNotification: jest.fn() },
}))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@/src/components", () => ({
  ListRow: () => null,
  SectionCard: () => null,
  SectionLabel: () => null,
}))
jest.mock("@/src/design/tokens", () => ({ useThemePalette: () => ({}) }))

const check = jest.fn()
const originalPlatform = Platform.OS
function updaterState(supported = true): ReturnType<typeof useAppUpdate> {
  return {
    data: undefined,
    error: null,
    busy: false,
    supported,
    check,
    download: jest.fn(),
    install: jest.fn(),
    setPreferences: jest.fn(),
  }
}
beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  jest.mocked(useAppUpdate).mockReturnValue(updaterState())
})
afterEach(() => {
  Platform.OS = originalPlatform
  jest.restoreAllMocks()
  jest.useRealTimers()
})

it("does not render update controls or schedule update checks on iOS", () => {
  Platform.OS = "ios"
  const section = render(<AppUpdateSection />)
  expect(section.toJSON()).toBeNull()
  expect(useAppUpdate).not.toHaveBeenCalled()
  jest.mocked(useAppUpdate).mockReturnValue(updaterState(false))
  render(<AppUpdateRuntime />)
  act(() => jest.advanceTimersByTime(60 * 60 * 1000))
  expect(check).not.toHaveBeenCalled()
})

it("checks on foreground activation and cleans up its lifecycle subscription", () => {
  const remove = jest.fn()
  const subscribe = jest
    .spyOn(AppState, "addEventListener")
    .mockReturnValue({ remove })
  const view = render(<AppUpdateRuntime />)
  const listener = subscribe.mock.calls[0]![1]
  act(() => listener("active"))
  expect(check).toHaveBeenCalledWith(false)
  view.unmount()
  expect(remove).toHaveBeenCalledTimes(1)
})
