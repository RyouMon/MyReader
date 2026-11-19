import { CoreFfiError } from "my-reader-core/src/generated/my_reader_core_ffi"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import { useRemoteDirectoryBrowser } from "./use-remote-directory-browser"

const mockOpenRemoteExistingLibrary = jest.fn()
const mockListRemoteDirectories = jest.fn()
const mockCreateRemoteDirectory = jest.fn()
const mockShowAlert = jest.fn()
const mockOnLibraryOpened = jest.fn()
const mockDataSource = {
  id: "source-1",
  type: "onedrive",
  name: "OneDrive",
  readonly: false,
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
  createRemoteDirectory: (...args: unknown[]) =>
    mockCreateRemoteDirectory(...args),
  listRemoteDirectories: (...args: unknown[]) =>
    mockListRemoteDirectories(...args),
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showErrorAlert: (...args: unknown[]) => mockShowAlert(...args),
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
    mockDataSource.readonly = false
  })

  it.each([
    false,
    true,
  ])("does not create folders while opening or browsing a readonly source (%s)", async (readonly) => {
    mockDataSource.readonly = readonly
    const { result } = renderHook(() =>
      useRemoteDirectoryBrowser({
        dataSourceId: "source-1",
        currentPathParam: "/Books",
        libraryAction: readonly ? "create" : "open",
        onLibraryOpened: mockOnLibraryOpened,
        sourceType: "onedrive",
      }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.canCreateDirectory).toBe(false)
    await act(async () => {
      expect(await result.current.createDirectory("New")).toBeNull()
    })
    expect(mockCreateRemoteDirectory).not.toHaveBeenCalled()
  })

  it.each([
    "onedrive",
    "gdrive",
    "dropbox",
  ] as const)("creates a child directory in the selected %s location", async (sourceType) => {
    mockDataSource.type = sourceType
    const folder = { name: "新书库", path: "/Books/新书库", isDirectory: true }
    mockCreateRemoteDirectory.mockResolvedValue(folder)
    const { result } = renderHook(() =>
      useRemoteDirectoryBrowser({
        dataSourceId: "source-1",
        currentPathParam: "/Books",
        libraryAction: "create",
        onLibraryOpened: mockOnLibraryOpened,
        sourceType,
      }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      expect(await result.current.createDirectory("新书库")).toEqual(folder)
    })
    expect(mockCreateRemoteDirectory).toHaveBeenCalledWith(
      mockDataSource,
      "/Books",
      "新书库",
    )
    expect(mockOnLibraryOpened).not.toHaveBeenCalled()
    expect(result.current.creating).toBe(false)
    expect(result.current.entries).toEqual([folder])
    expect(result.current.currentPath).toBe("/Books")
    mockDataSource.type = "onedrive"
  })

  it("preserves the current directory after failure and allows retry without duplicate submissions", async () => {
    let reject!: (error: Error) => void
    mockCreateRemoteDirectory.mockImplementationOnce(
      () =>
        new Promise((_, no) => {
          reject = no
        }),
    )
    const { result } = renderHook(() =>
      useRemoteDirectoryBrowser({
        dataSourceId: "source-1",
        currentPathParam: "/Books",
        libraryAction: "create",
        onLibraryOpened: mockOnLibraryOpened,
        sourceType: "onedrive",
      }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.createDirectory("Library")
    })
    await act(async () => {
      expect(await result.current.createDirectory("Library")).toBeNull()
      reject(new Error("REMOTE_DIRECTORY_ALREADY_EXISTS"))
      await pending
    })
    expect(mockCreateRemoteDirectory).toHaveBeenCalledTimes(1)
    expect(result.current.currentPath).toBe("/Books")
    expect(result.current.creationError).toContain(
      "REMOTE_DIRECTORY_ALREADY_EXISTS",
    )
    mockCreateRemoteDirectory.mockResolvedValue({
      name: "New",
      path: "/Books/New",
      isDirectory: true,
    })
    await act(async () => {
      await result.current.createDirectory("New")
    })
    expect(result.current.creationError).toBeNull()
  })

  it("should show duplicate feedback without replacing directory state when library already exists", async () => {
    mockOpenRemoteExistingLibrary.mockRejectedValue(
      new CoreFfiError.LibraryAlreadyExists("diagnostic changed"),
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
      `${errorMessages.duplicateMessage}\n\nLibraryAlreadyExists: CoreFfiError.LibraryAlreadyExists: diagnostic changed`,
    )
    expect(result.current.error).toBeNull()
    expect(mockOnLibraryOpened).not.toHaveBeenCalled()
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
    expect(mockOnLibraryOpened).toHaveBeenCalledWith(library)
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
    await waitFor(() =>
      expect(result.current.error).toBe(
        "This action could not be completed. Please try again.\n\nError: temporary failure",
      ),
    )

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
      new CoreFfiError.Credential("diagnostic changed"),
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
