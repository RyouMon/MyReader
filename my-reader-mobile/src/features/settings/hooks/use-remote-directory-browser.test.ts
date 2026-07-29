import { act, renderHook, waitFor } from "@testing-library/react-native"

const mockRegisterRemoteLibrary = jest.fn()
const mockListRemoteDirectories = jest.fn()
const mockShowAlert = jest.fn()
const mockNotifyLibraryAdded = jest.fn()
const mockDismissTo = jest.fn()
const mockDataSource = {
  id: "source-1",
  type: "onedrive",
  name: "OneDrive",
}
const mockStoreState = {
  dataSources: [mockDataSource],
}

jest.mock("expo-router", () => ({
  router: {
    dismissTo: (...args: unknown[]) => mockDismissTo(...args),
  },
}))

jest.mock("@/src/domain/library/hooks/library-actions", () => ({
  addRemoteLibraryFromSource: (...args: unknown[]) =>
    mockRegisterRemoteLibrary(...args),
}))

jest.mock("@/src/domain/library/remote-library", () => ({
  normalizeCurrentPath: (path: string | undefined) => {
    const normalized = (path ?? "").trim()
    if (!normalized || normalized === "/") return "/"
    return normalized.startsWith("/") ? normalized : `/${normalized}`
  },
  isMissingMetadataDbError: (error: unknown) =>
    error instanceof Error && error.message.includes("ONEDRIVE_NOT_FOUND"),
}))

jest.mock("@/src/services/core/remote", () => ({
  listRemoteDirectories: (...args: unknown[]) =>
    mockListRemoteDirectories(...args),
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: (...args: unknown[]) => mockShowAlert(...args),
}))

jest.mock("@/src/domain/notifications/library-notifications", () => ({
  notifyLibraryAdded: (...args: unknown[]) => mockNotifyLibraryAdded(...args),
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: (selector: (state: object) => unknown) =>
    selector(mockStoreState),
}))

import { useRemoteDirectoryBrowser } from "./use-remote-directory-browser"

const errorMessages = {
  notValidTitle: "Invalid directory",
  notValidMessage: "metadata.db not found",
  duplicateTitle: "Cannot add",
  duplicateMessage: "This library has already been added.",
  generic: "Not a Calibre library",
}

describe("useRemoteDirectoryBrowser", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockListRemoteDirectories.mockResolvedValue([])
  })

  it("should show duplicate feedback without replacing directory state when library already exists", async () => {
    mockRegisterRemoteLibrary.mockRejectedValue(
      new Error("CORE_ERROR: CONFIG_ERROR: LIBRARY_ALREADY_EXISTS"),
    )
    const { result } = renderHook(() =>
      useRemoteDirectoryBrowser({
        dataSourceId: "source-1",
        currentPathParam: "/Library/CalibreLibrary",
        sourceType: "onedrive",
      }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.chooseCurrentPath(errorMessages)
    })

    expect(mockShowAlert).toHaveBeenCalledWith(
      errorMessages.duplicateTitle,
      errorMessages.duplicateMessage,
    )
    expect(result.current.error).toBeNull()
    expect(mockDismissTo).not.toHaveBeenCalled()
  })
})
