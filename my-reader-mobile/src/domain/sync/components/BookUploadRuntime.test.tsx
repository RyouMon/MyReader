import { render, waitFor } from "@testing-library/react-native"
import i18n from "@/src/i18n"

import { BookUploadRuntime } from "./BookUploadRuntime"

const mockLibrary = {
  id: "library-1",
  name: "Remote Library",
  path: "file:///library",
  sourceType: "onedrive",
  dataSourceId: "onedrive-1",
}
const mockState = {
  storeReady: true,
  libraries: [mockLibrary],
  dataSources: [],
}
const mockOpenSyncContext = jest.fn()
const mockRunPendingBookUploads = jest.fn()
const mockAnnounceLocalSidecarWork = jest.fn()
const mockInvalidateFileStates = jest.fn()
const mockShowAlert = jest.fn()

jest.mock("expo-network", () => ({
  getNetworkStateAsync: jest.fn(() =>
    Promise.resolve({ isInternetReachable: true }),
  ),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}))

jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native")
  return new Proxy(actual, {
    get(target, property) {
      if (property === "AppState") {
        return {
          ...target.AppState,
          addEventListener: jest.fn(() => ({ remove: jest.fn() })),
        }
      }
      return target[property]
    },
  })
})

jest.mock("@/src/store/app-store", () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mockState) => unknown) => selector(mockState),
    {
      getState: () => mockState,
      subscribe: jest.fn(() => jest.fn()),
    },
  ),
}))

jest.mock("@/src/domain/sync/context", () => ({
  openSyncContext: (...args: unknown[]) => mockOpenSyncContext(...args),
}))

jest.mock("@/src/services/core/book-transfer", () => ({
  runPendingBookUploads: (...args: unknown[]) =>
    mockRunPendingBookUploads(...args),
}))

jest.mock("@/src/services/core/sync-events", () => ({
  announceLocalSidecarWork: (...args: unknown[]) =>
    mockAnnounceLocalSidecarWork(...args),
}))

jest.mock("@/src/services/query/invalidate-table", () => ({
  invalidateFileStates: (...args: unknown[]) =>
    mockInvalidateFileStates(...args),
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: (...args: unknown[]) => mockShowAlert(...args),
}))

describe("BookUploadRuntime", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOpenSyncContext.mockResolvedValue({
      libraryRootUri: "file:///library",
      libraryStorage: {
        kind: "onedrive",
        accessToken: "token",
        root: "/Library",
      },
    })
    mockRunPendingBookUploads.mockResolvedValue(["book-uuid"])
    mockInvalidateFileStates.mockResolvedValue(undefined)
  })

  it("should schedule a short metadata push when background upload completes", async () => {
    render(<BookUploadRuntime />)

    await waitFor(() => {
      expect(mockRunPendingBookUploads).toHaveBeenCalledWith(
        expect.objectContaining({
          library: mockLibrary,
          libraryRootUri: "file:///library",
        }),
      )
    })
    await waitFor(() => {
      expect(mockInvalidateFileStates).toHaveBeenCalledWith("library-1")
      expect(mockAnnounceLocalSidecarWork).toHaveBeenCalledWith("library-1", {
        required: true,
      })
    })
  })

  it("should alert when a background book upload fails", async () => {
    mockRunPendingBookUploads.mockRejectedValueOnce(
      new Error("PENDING_BOOK_CATALOG_IDENTITY_CONFLICT"),
    )

    render(<BookUploadRuntime />)

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        i18n.t("bookMenu.uploadFailed"),
        i18n.t("bookMenu.uploadFailedDetail", {
          library: mockLibrary.name,
          reason: "PENDING_BOOK_CATALOG_IDENTITY_CONFLICT",
        }),
      )
    })
  })
})
