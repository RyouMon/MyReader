import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import { router } from "expo-router"
import LibraryLocationScreen from "./library-location-screen"
import { readLibraryLocation } from "@/src/services/core/library-location"
import { relocateLibrary } from "@/src/domain/library/relocate-library"
import { pickLocalLibraryDirectory } from "@/src/domain/library/local-library-picker"
import { listRemoteDirectories } from "@/src/services/core/remote"

jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: jest.fn(),
}))

const mockSync = jest.fn(() => Promise.resolve())
const mockLibrary = {
  id: "lib",
  name: "Books",
  path: "file:///cache",
  bookCount: 2,
  sourcePath: "/old",
  sourceType: "webdav",
  dataSourceId: "dav",
}
const mockSource = {
  id: "dav",
  name: "Shelf",
  type: "webdav",
  rootPath: "/base",
}
let mockState = {
  activeLibraryId: "lib",
  libraries: [mockLibrary],
  dataSources: [mockSource],
}
const location = {
  libraryId: "lib",
  libraryName: "Books",
  sourceRoot: "/base",
  path: "/old",
  effectivePath: "https://example.test/dav/base/old",
  canRelocate: true,
  problem: "path_unavailable",
  dataSourceId: "dav",
  dataSourceName: "Shelf",
  detail: "HTTP 404 diagnostic",
}
jest.mock("@/src/services/core/library-location", () => ({
  readLibraryLocation: jest.fn(),
}))
jest.mock("@/src/domain/library/relocate-library", () => ({
  relocateLibrary: jest.fn(),
}))
jest.mock("@/src/domain/library/local-library-picker", () => ({
  pickLocalLibraryDirectory: jest.fn(),
}))
jest.mock("@/src/services/core/remote", () => ({
  listRemoteDirectories: jest.fn(),
}))
jest.mock("@/src/store/app-store", () => ({
  useAppStore: (selector: (state: typeof mockState) => unknown) =>
    selector(mockState),
}))
jest.mock("@/src/domain/sync/hooks/use-sync-library", () => ({
  useSyncLibrary: () => ({ syncNow: mockSync, isSyncing: false }),
}))
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ libraryId: "lib" }),
  Stack: { Screen: () => null },
}))
jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: () => ({ options: {}, toolbar: null }),
}))
jest.mock("@/src/design/tokens", () => ({ useThemePalette: () => ({}) }))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@/src/components/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react")
  const { View, Text, Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native")
  return {
    Screen: View,
    SectionCard: View,
    Button: ({
      title,
      disabled,
      onPress,
    }: {
      title: string
      disabled?: boolean
      onPress?: () => void
    }) =>
      React.createElement(
        Pressable,
        {
          onPress,
          disabled,
          accessibilityRole: "button",
          accessibilityState: { disabled },
        },
        React.createElement(Text, null, title),
      ),
    ListRow: ({ title, onPress }: { title: string; onPress?: () => void }) =>
      React.createElement(
        Pressable,
        { onPress },
        React.createElement(Text, null, title),
      ),
  }
})
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  render(
    <QueryClientProvider client={client}>
      <LibraryLocationScreen />
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  jest.clearAllMocks()
  mockState = {
    activeLibraryId: "lib",
    libraries: [mockLibrary],
    dataSources: [mockSource],
  }
  jest.mocked(readLibraryLocation).mockResolvedValue(location)
  jest
    .mocked(listRemoteDirectories)
    .mockResolvedValue([{ name: "Moved", path: "/new", isDirectory: true }])
  jest.mocked(relocateLibrary).mockResolvedValue({
    ...location,
    problem: undefined,
    path: "/new",
    effectivePath: "https://example.test/dav/base/new",
  })
})
it("shows readable paths, selectable diagnostics and repairs a remote library before retrying", async () => {
  mount()
  await screen.findByText("Books")
  expect(
    screen.getByText(/https:\/\/example.test\/dav\/base\/old/).props.selectable,
  ).toBe(true)
  expect(screen.queryByText("HTTP 404 diagnostic")).toBeNull()
  fireEvent.press(screen.getByText("libraryLocation.technicalDetails"))
  expect(screen.getByText("HTTP 404 diagnostic").props.selectable).toBe(true)
  fireEvent.press(screen.getByText("libraryLocation.choose"))
  fireEvent.press(await screen.findByText("Moved"))
  await waitFor(() =>
    expect(listRemoteDirectories).toHaveBeenCalledWith(mockSource, "/new"),
  )
  fireEvent.press(screen.getByText("libraryLocation.up"))
  await waitFor(() =>
    expect(listRemoteDirectories).toHaveBeenCalledWith(mockSource, "/"),
  )
  fireEvent.press(screen.getByText("Moved"))
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "libraryLocation.save" }).props
        .accessibilityState.disabled,
    ).toBe(false),
  )
  fireEvent.press(screen.getByText("libraryLocation.save"))
  await screen.findByText("libraryLocation.saved")
  expect(relocateLibrary).toHaveBeenCalledWith(
    mockLibrary,
    "/new",
    undefined,
    undefined,
  )
  fireEvent.press(screen.getByText("libraryLocation.retry"))
  await waitFor(() =>
    expect(mockSync).toHaveBeenCalledWith("lib", { showFailureAlert: false }),
  )
})
it("keeps validation errors and settings access visible without offering success", async () => {
  jest
    .mocked(relocateLibrary)
    .mockResolvedValue({ ...location, problem: "identity_mismatch" })
  jest
    .mocked(readLibraryLocation)
    .mockResolvedValue({ ...location, problem: "credential" })
  mount()
  fireEvent.press(await screen.findByText("libraryLocation.sourceSettings"))
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/settings/webdav/[dataSourceId]",
    params: { dataSourceId: "dav" },
  })
  fireEvent.press(screen.getByText("libraryLocation.choose"))
  await screen.findByText("Moved")
  fireEvent.press(screen.getByText("libraryLocation.save"))
  await screen.findByText("libraryLocation.problems.identity_mismatch")
  expect(screen.queryByText("libraryLocation.saved")).toBeNull()
})
it("leaves configuration untouched when the system picker is cancelled", async () => {
  mockState = { ...mockState, dataSources: [] }
  jest.mocked(pickLocalLibraryDirectory).mockResolvedValue(null)
  mount()
  fireEvent.press(await screen.findByText("libraryLocation.choose"))
  await waitFor(() => expect(pickLocalLibraryDirectory).toHaveBeenCalled())
  expect(relocateLibrary).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText("common.cancel"))
  expect(router.back).toHaveBeenCalled()
})
it("passes the selected directory bookmark and handles picker or save errors", async () => {
  mockState = { ...mockState, dataSources: [] }
  jest
    .mocked(pickLocalLibraryDirectory)
    .mockRejectedValueOnce(new Error("access denied"))
  const bookmark = {
    bookmarkBase64: "bookmark",
    resolvedUri: "file:///new",
    stale: false,
  }
  jest.mocked(pickLocalLibraryDirectory).mockResolvedValueOnce({
    uri: "file:///new",
    securityScopedBookmark: bookmark,
  })
  jest.mocked(relocateLibrary).mockRejectedValueOnce(new Error("cannot save"))
  mount()
  fireEvent.press(await screen.findByText("libraryLocation.choose"))
  await screen.findByText("Error: access denied")
  fireEvent.press(screen.getByText("libraryLocation.choose"))
  fireEvent.press(await screen.findByText("libraryLocation.save"))
  await screen.findByText("Error: cannot save")
  expect(relocateLibrary).toHaveBeenCalledWith(
    mockLibrary,
    "file:///new",
    bookmark,
    "file:///new",
  )
})
it("allows folder-list retry and routes OneDrive access failures to the source", async () => {
  mockState = {
    ...mockState,
    libraries: [{ ...mockLibrary, sourceType: "onedrive" }],
  }
  jest
    .mocked(readLibraryLocation)
    .mockResolvedValue({ ...location, problem: "data_source" })
  jest.mocked(listRemoteDirectories).mockRejectedValueOnce(new Error("offline"))
  mount()
  fireEvent.press(await screen.findByText("libraryLocation.sourceSettings"))
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/settings/onedrive/[dataSourceId]",
    params: { dataSourceId: "dav" },
  })
  fireEvent.press(screen.getByText("libraryLocation.choose"))
  await screen.findByText("Error: offline")
  fireEvent.press(screen.getByText("libraryLocation.retry"))
  await screen.findByText("Moved")
})
it("shows no directory-edit action for app-managed storage", async () => {
  jest
    .mocked(readLibraryLocation)
    .mockResolvedValue({ ...location, canRelocate: false, problem: undefined })
  mount()
  await screen.findByText("Books")
  expect(screen.queryByText("libraryLocation.choose")).toBeNull()
})
