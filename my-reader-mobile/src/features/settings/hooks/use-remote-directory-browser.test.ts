import { act, renderHook, waitFor } from "@testing-library/react-native"

import { useRemoteDirectoryBrowser } from "./use-remote-directory-browser"

const mockOpenRemoteExistingLibrary = jest.fn()
const mockListRemoteDirectories = jest.fn()
const mockShowAlert = jest.fn()
const mockNotifyLibraryAdded = jest.fn()
const mockOnLibraryOpened = jest.fn()
const mockDataSource = {
  id: "source-1",
  type: "onedrive",
  name: "OneDrive",
}
const mockStoreState = {
  dataSources: [mockDataSource],
}

jest.mock("@/src/domain/library/hooks/library-actions", () => ({
  openRemoteExistingLibrary: (...args: unknown[]) =>
    mockOpenRemoteExistingLibrary(...args),
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
    mockOpenRemoteExistingLibrary.mockRejectedValue(
      new Error("CORE_ERROR: CONFIG_ERROR: LIBRARY_ALREADY_EXISTS"),
    )
    const { result } = renderHook(() =>
      useRemoteDirectoryBrowser({
        dataSourceId: "source-1",
        currentPathParam: "/Library/CalibreLibrary",
        libraryAction: "open",
        onLibraryOpened: mockOnLibraryOpened,
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
    expect(mockOnLibraryOpened).not.toHaveBeenCalled()
    expect(mockNotifyLibraryAdded).not.toHaveBeenCalled()
  })

  it("should open the selected library and notify the caller", async () => {
    const library = { id: "library-1", name: "Library" }
    mockOpenRemoteExistingLibrary.mockResolvedValue(library)
    const { result } = renderHook(() =>
      useRemoteDirectoryBrowser({
        dataSourceId: "source-1",
        currentPathParam: "/Books",
        libraryAction: "open",
        onLibraryOpened: mockOnLibraryOpened,
        sourceType: "onedrive",
      }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.choosePath("/Books/Library", errorMessages)
    })

    expect(mockOpenRemoteExistingLibrary).toHaveBeenCalledWith(
      mockDataSource,
      "/Books/Library",
    )
    expect(mockOnLibraryOpened).toHaveBeenCalledTimes(1)
    expect(mockNotifyLibraryAdded).toHaveBeenCalledWith(library.name)
  })

  it("should reload the directory when retry is requested", async () => {
    mockListRemoteDirectories
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce([{ name: "Library", isDirectory: true }])
    const { result } = renderHook(() =>
      useRemoteDirectoryBrowser({
        dataSourceId: "source-1",
        currentPathParam: "/Books",
        libraryAction: "open",
        onLibraryOpened: mockOnLibraryOpened,
        sourceType: "onedrive",
      }),
    )
    await waitFor(() => expect(result.current.error).toBe("temporary failure"))

    act(() => result.current.retry())

    await waitFor(() =>
      expect(result.current.entries).toEqual([
        { name: "Library", isDirectory: true },
      ]),
    )
    expect(mockListRemoteDirectories).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
  })

  it("should offer account recovery when OneDrive rejects the stored credentials", async () => {
    mockListRemoteDirectories.mockRejectedValue(
      new Error("AUTH_ERROR: ONEDRIVE_UNAUTHORIZED"),
    )
    const { result } = renderHook(() =>
      useRemoteDirectoryBrowser({
        dataSourceId: "source-1",
        currentPathParam: "/Books",
        libraryAction: "open",
        onLibraryOpened: mockOnLibraryOpened,
        sourceType: "onedrive",
      }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.resolveFailed).toBe(true)
    expect(result.current.error).toBeNull()
  })
})
