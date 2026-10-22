import { act, fireEvent, render } from "@testing-library/react-native"
import type { ReactNode } from "react"
import { Notifier } from "react-native-notifier"
import { AppState, Linking } from "react-native"
import { AppUpdateRuntime } from "./app-update-runtime"
import { AppUpdateSection } from "./app-update-section"
import { useAppUpdate } from "./use-app-update"
import { Platform } from "react-native"

jest.mock("./use-app-update", () => ({ useAppUpdate: jest.fn() }))
jest.mock("react-native-notifier", () => ({
  Notifier: { showNotification: jest.fn() },
}))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { version?: string }) =>
      options?.version ? `${key}:${options.version}` : key,
  }),
}))
jest.mock("@/src/components", () => ({
  ListRow: ({
    title,
    onPress,
    accessory,
  }: {
    title: string
    onPress?: () => void
    accessory?: ReactNode
  }) => {
    const { Pressable, Text } = jest.requireActual("react-native")
    if (accessory) return <>{accessory}</>
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onPress}
      >
        <Text>{title}</Text>
      </Pressable>
    )
  },
  SectionCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  SectionLabel: () => null,
}))
jest.mock("@/src/design/tokens", () => ({ useThemePalette: () => ({}) }))

const check = jest.fn()
const originalPlatform = Platform.OS
const snapshot = {
  currentVersion: "0.18.0",
  autoCheck: true,
  autoDownload: false,
  status: "upToDate",
  version: undefined,
  releaseUrl: "https://github.com/RyouMon/MyReader/releases/tag/v0.18.0",
  notes: "Improved library browsing",
  assetName: undefined,
  downloadedBytes: 0,
  totalBytes: 0,
  error: undefined,
}
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

it("hides release content on Android when no update is available", () => {
  Platform.OS = "android"
  const state = updaterState()
  state.data = snapshot
  jest.mocked(useAppUpdate).mockReturnValue(state)
  const section = render(<AppUpdateSection />)
  expect(section.queryByText(/appUpdates.latestVersion/)).toBeNull()
  expect(section.queryByText("Improved library browsing")).toBeNull()
  expect(state.download).not.toHaveBeenCalled()
  expect(state.install).not.toHaveBeenCalled()
})

it("renders the new Android version with Markdown notes and opens links only on press", () => {
  Platform.OS = "android"
  const state = updaterState()
  state.data = {
    ...snapshot,
    version: "0.19.0",
    status: "available",
    notes:
      "## Improvements\n\n- **Faster browsing**\n- Fixed EPUB loading\n\n[Full changelog](https://github.com/RyouMon/MyReader/releases/tag/v0.19.0)",
  }
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true)
  jest.mocked(useAppUpdate).mockReturnValue(state)
  const section = render(<AppUpdateSection />)
  expect(section.getByText("appUpdates.latestVersion:0.19.0")).toBeTruthy()
  expect(section.getByText("Improvements")).toBeTruthy()
  expect(section.queryByText("## Improvements")).toBeNull()
  expect(section.getByText("Faster browsing")).toHaveStyle({
    fontWeight: "bold",
  })
  expect(section.getByText("Fixed EPUB loading")).toBeTruthy()
  expect(open).not.toHaveBeenCalled()
  fireEvent.press(section.getByText("Full changelog"))
  expect(open).toHaveBeenCalledWith(
    "https://github.com/RyouMon/MyReader/releases/tag/v0.19.0",
  )
})

it("explains when a new Android release has no notes", () => {
  Platform.OS = "android"
  const state = updaterState()
  state.data = {
    ...snapshot,
    version: "0.19.0",
    status: "available",
    notes: " ",
  }
  jest.mocked(useAppUpdate).mockReturnValue(state)
  expect(
    render(<AppUpdateSection />).getByText("appUpdates.notesEmpty"),
  ).toBeTruthy()
})

it("offers explicit check, download, preferences, and installation actions on Android", () => {
  Platform.OS = "android"
  const state = updaterState()
  state.data = { ...snapshot, version: "0.19.0", status: "available" }
  jest.mocked(useAppUpdate).mockReturnValue(state)
  const section = render(<AppUpdateSection />)
  fireEvent.press(section.getByLabelText("appUpdates.check"))
  fireEvent.press(section.getByLabelText("appUpdates.download"))
  fireEvent(
    section.getByLabelText("appUpdates.autoDownload"),
    "valueChange",
    true,
  )
  fireEvent(
    section.getByLabelText("appUpdates.autoCheck"),
    "valueChange",
    false,
  )
  expect(check).toHaveBeenCalled()
  expect(state.download).toHaveBeenCalledTimes(1)
  expect(state.setPreferences).toHaveBeenCalledWith(true, true)
  expect(state.setPreferences).toHaveBeenCalledWith(false, false)
  expect(state.install).not.toHaveBeenCalled()
  state.data = { ...state.data, status: "downloaded" }
  section.rerender(<AppUpdateSection />)
  fireEvent.press(section.getByLabelText("appUpdates.install"))
  expect(state.install).toHaveBeenCalledTimes(1)
})

it("announces availability and completed downloads once and never opens the installer", () => {
  const state = updaterState()
  state.data = { ...snapshot, version: "0.19.0", status: "available" }
  jest.mocked(useAppUpdate).mockReturnValue(state)
  const runtime = render(<AppUpdateRuntime />)
  runtime.rerender(<AppUpdateRuntime />)
  expect(Notifier.showNotification).toHaveBeenCalledTimes(1)
  state.data = { ...state.data, status: "downloaded" }
  runtime.rerender(<AppUpdateRuntime />)
  expect(Notifier.showNotification).toHaveBeenCalledTimes(2)
  expect(state.install).not.toHaveBeenCalled()
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
