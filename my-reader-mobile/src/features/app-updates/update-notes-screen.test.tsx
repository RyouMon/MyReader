import { fireEvent, render } from "@testing-library/react-native"
import { Redirect, router } from "expo-router"
import { Linking, Platform } from "react-native"
import UpdateNotesScreen from "@/src/app/update-notes"
import { useAppUpdate } from "./use-app-update"

jest.mock("@expo/material-symbols/close.xml", () => ({ uri: "close" }))
jest.mock("./use-app-update", () => ({ useAppUpdate: jest.fn() }))
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock("expo-router", () => ({
  Redirect: jest.fn(() => null),
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    replace: jest.fn(),
  },
}))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { version?: string }) =>
      options?.version ? `${key}:${options.version}` : key,
  }),
}))
jest.mock("@/tw", () => ({
  ...jest.requireActual("@/tw"),
  useCSSVariable: () => 14,
}))
jest.mock("@/src/design/tokens", () => ({ useThemePalette: () => ({}) }))
jest.mock("@/src/components/ui/android-header-icon-button", () => ({
  AndroidHeaderIconButton: (props: {
    accessibilityLabel: string
    onPress: () => void
  }) => {
    const { Pressable } = jest.requireActual("react-native")
    return <Pressable accessibilityRole="button" {...props} />
  },
}))

const originalPlatform = Platform.OS
const release = {
  currentVersion: "0.18.0",
  autoCheck: true,
  autoDownload: false,
  status: "available",
  version: "0.19.0",
  notes:
    "## Improvements\n\n- **Faster browsing**\n- Fixed EPUB loading\n\n[Full changelog](https://github.com/RyouMon/MyReader/releases/tag/v0.19.0)",
  downloadedBytes: 0,
  totalBytes: 0,
}
function setRelease(data: ReturnType<typeof useAppUpdate>["data"]) {
  jest.mocked(useAppUpdate).mockReturnValue({
    data,
    error: null,
    busy: false,
    supported: true,
    check: jest.fn(),
    download: jest.fn(),
    install: jest.fn(),
    setPreferences: jest.fn(),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  Platform.OS = "android"
  jest.mocked(router.canGoBack).mockReturnValue(true)
  setRelease(release)
})
afterEach(() => {
  Platform.OS = originalPlatform
  jest.restoreAllMocks()
})

it("shows the version and rendered Markdown in the dedicated notes sheet", () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true)
  const sheet = render(<UpdateNotesScreen />)
  expect(sheet.getByText("appUpdates.latestVersion:0.19.0")).toBeTruthy()
  expect(sheet.getByText("Improvements")).toBeTruthy()
  expect(sheet.queryByText("## Improvements")).toBeNull()
  expect(sheet.getByText("Faster browsing")).toHaveStyle({ fontWeight: "bold" })
  expect(sheet.getByText("Fixed EPUB loading")).toBeTruthy()
  expect(open).not.toHaveBeenCalled()
  fireEvent.press(sheet.getByText("Full changelog"))
  expect(open).toHaveBeenCalledWith(
    "https://github.com/RyouMon/MyReader/releases/tag/v0.19.0",
  )
  fireEvent.press(sheet.getByRole("button", { name: "common.close" }))
  expect(router.back).toHaveBeenCalledTimes(1)
})

it("shows an empty-notes message and closes a directly opened sheet to settings", () => {
  setRelease({ ...release, notes: " " })
  jest.mocked(router.canGoBack).mockReturnValue(false)
  const sheet = render(<UpdateNotesScreen />)
  expect(sheet.getByText("appUpdates.notesEmpty")).toBeTruthy()
  fireEvent.press(sheet.getByRole("button", { name: "common.close" }))
  expect(router.replace).toHaveBeenCalledWith("/settings")
})

it("returns to settings if a release is no longer available", () => {
  setRelease({ ...release, version: undefined })
  const sheet = render(<UpdateNotesScreen />)
  expect(sheet.queryByText("Improvements")).toBeNull()
  expect(jest.mocked(Redirect).mock.calls[0]?.[0]).toEqual({
    href: "/settings",
  })
})

it("keeps the notes route unavailable on iOS without initializing updates", () => {
  Platform.OS = "ios"
  render(<UpdateNotesScreen />)
  expect(useAppUpdate).not.toHaveBeenCalled()
  expect(jest.mocked(Redirect).mock.calls[0]?.[0]).toEqual({
    href: "/settings",
  })
})
