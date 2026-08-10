import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import { router } from "expo-router"
import * as mockReact from "react"
import {
  Pressable as mockPressable,
  Text as mockText,
  TextInput as mockTextInput,
  View as mockView,
  Platform,
} from "react-native"

import { ENTITY_LIST_ROW_ICONS } from "@/src/components/ui/entity-list-row-icons"
import type { DataSource } from "@/src/domain/types"
import AddLibraryScreen, {
  AddLibraryLocationScreen,
  CreateLibraryScreen,
} from "./add-library-screen"

let mockParams: {
  dataSourceId?: string
  libraryAction?: string
  pendingShareName?: string
  pendingShareUri?: string
  sourcePath?: string
} = { libraryAction: "create" }
let mockPendingImport: { originalName?: string; uri: string } | null = null
let mockLocalFolder: {
  uri: string
  name?: string
  securityScopedBookmark?: {
    bookmarkBase64: string
    resolvedUri: string
    stale: boolean
  }
} | null = null
let mockDataSources: DataSource[] = []
const mockCreateAppInternalMyReaderLibrary = jest.fn()
const mockCreateFolderMyReaderLibrary = jest.fn()
const mockCreateRemoteMyReaderLibrary = jest.fn()
const mockOpenExistingLocalLibraryFromPicker = jest.fn()
const mockPickLocalLibraryDirectory = jest.fn()
const mockDismissAddLibrary = jest.fn()
const mockNotifyLibraryAdded = jest.fn()
const mockUseScreenHeader = jest.fn((_options: unknown) => ({
  options: {},
  toolbar: null,
}))
const mockSetPendingImport = jest.fn((pendingImport) => {
  mockPendingImport = pendingImport
})
const mockSetLocalFolder = jest.fn((folder) => {
  mockLocalFolder = folder
})
const mockTakePendingImport = jest.fn(() => {
  const pendingImport = mockPendingImport
  mockPendingImport = null
  return pendingImport
})

jest.mock("expo-router", () => ({
  Stack: { Screen: jest.fn(() => null) },
  router: {
    back: jest.fn(),
    dismissTo: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  },
  useLocalSearchParams: () => mockParams,
}))

jest.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: jest.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("@/src/components", () => ({
  FormLabeledFieldRow: jest.fn(({ children }) =>
    mockReact.createElement(mockView, null, children),
  ),
  HelpSection: jest.fn(
    ({
      title,
      items,
    }: {
      title: string
      items: Array<{ title: string; body: string }>
    }) =>
      mockReact.createElement(
        mockView,
        null,
        mockReact.createElement(mockText, null, title),
        ...items.flatMap((item) => [
          mockReact.createElement(mockText, { key: item.title }, item.title),
          mockReact.createElement(mockText, { key: item.body }, item.body),
        ]),
      ),
  ),
  ListRow: jest.fn(
    ({
      detail,
      onPress,
      testID,
      title,
      value,
    }: {
      detail?: string
      onPress?: () => void
      testID?: string
      title: string
      value?: string
    }) =>
      mockReact.createElement(
        mockPressable,
        { onPress, testID },
        mockReact.createElement(mockText, null, title),
        detail ? mockReact.createElement(mockText, null, detail) : null,
        value ? mockReact.createElement(mockText, null, value) : null,
      ),
  ),
  Screen: jest.fn(({ children }) =>
    mockReact.createElement(mockView, null, children),
  ),
  SectionCard: jest.fn(({ children }) =>
    mockReact.createElement(mockView, null, children),
  ),
  SectionLabel: jest.fn(({ children }) =>
    mockReact.createElement(mockText, null, children),
  ),
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    border: "#ddd",
    primary: "#c4622d",
    surface: "#fff",
    text: "#111",
    textMuted: "#666",
  }),
}))

jest.mock("@/src/domain/library/hooks/library-actions", () => ({
  createAppInternalMyReaderLibrary: (...args: unknown[]) =>
    mockCreateAppInternalMyReaderLibrary(...args),
  createFolderMyReaderLibrary: (...args: unknown[]) =>
    mockCreateFolderMyReaderLibrary(...args),
  createRemoteMyReaderLibrary: (...args: unknown[]) =>
    mockCreateRemoteMyReaderLibrary(...args),
  nextMyReaderLibraryName: () => "My Library",
  openExistingLocalLibraryFromPicker: (...args: unknown[]) =>
    mockOpenExistingLocalLibraryFromPicker(...args),
}))

jest.mock("@/src/domain/library/local-library-picker", () => ({
  pickLocalLibraryDirectory: (...args: unknown[]) =>
    mockPickLocalLibraryDirectory(...args),
}))

jest.mock("./add-library-flow-context", () => ({
  useAddLibraryFlow: () => ({
    dismiss: mockDismissAddLibrary,
    localFolder: mockLocalFolder,
    pendingImport: mockPendingImport,
    setLocalFolder: mockSetLocalFolder,
    setPendingImport: mockSetPendingImport,
    takePendingImport: mockTakePendingImport,
  }),
}))

jest.mock("@/src/domain/notifications/library-notifications", () => ({
  notifyLibraryAdded: (...args: unknown[]) => mockNotifyLibraryAdded(...args),
}))

jest.mock("@/src/features/onedrive/hooks/use-add-onedrive-data-source", () => ({
  useAddOneDriveDataSource: () => ({
    addOneDriveDataSource: jest.fn(),
    busy: false,
  }),
}))

jest.mock("@/src/features/onedrive/onedrive-adding-empty-state", () => ({
  OneDriveAddingEmptyState: jest.fn(() => null),
}))

jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: (options: unknown) => mockUseScreenHeader(options),
}))

jest.mock("@/src/navigation/toolbar-action-helpers", () => ({
  createSaveAction: (action: unknown) => action,
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: (selector: (state: { dataSources: DataSource[] }) => unknown) =>
    selector({ dataSources: mockDataSources }),
}))

jest.mock("@/tw", () => ({
  Text: mockText,
  TextInput: mockTextInput,
  View: mockView,
}))

describe("AddLibraryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should close through the modal flow owner", () => {
    render(<AddLibraryScreen />)

    const headerOptions = mockUseScreenHeader.mock.calls[0]?.[0] as {
      left?: { onPress: () => void }[]
    }
    expect(headerOptions.left).toHaveLength(1)

    headerOptions.left?.[0]?.onPress()

    expect(mockDismissAddLibrary).toHaveBeenCalledTimes(1)
  })

  it("should explain library types, sync, and choice before continuing", () => {
    render(<AddLibraryScreen />)

    const helpSectionMock = jest.requireMock("@/src/components")
      .HelpSection as jest.Mock
    const helpItems = helpSectionMock.mock.calls[0]?.[0]?.items as Array<{
      title: string
    }>

    expect(helpItems.map((item) => item.title)).toEqual([
      "addLibraryFlow.help.myreader.title",
      "addLibraryFlow.help.calibre.title",
      "addLibraryFlow.help.sync.title",
      "addLibraryFlow.help.choice.title",
    ])
    expect(screen.getByText("addLibraryFlow.create.description")).toBeTruthy()
    expect(screen.getByText("addLibraryFlow.open.description")).toBeTruthy()
    expect(screen.getByText("addLibraryFlow.help.myreader.title")).toBeTruthy()
    expect(screen.getByText("addLibraryFlow.help.myreader.body")).toBeTruthy()
    expect(screen.getByText("addLibraryFlow.help.calibre.title")).toBeTruthy()
    expect(screen.getByText("addLibraryFlow.help.calibre.body")).toBeTruthy()
    expect(screen.getByText("addLibraryFlow.help.sync.title")).toBeTruthy()
    expect(screen.getByText("addLibraryFlow.help.sync.body")).toBeTruthy()
    expect(screen.getByText("addLibraryFlow.help.choice.title")).toBeTruthy()
    expect(screen.getByText("addLibraryFlow.help.choice.body")).toBeTruthy()
  })
})

describe("AddLibraryLocationScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" })
    mockLocalFolder = null
    mockPendingImport = null
    mockDataSources = []
  })

  it("should offer internal and local storage when creating on iOS", () => {
    mockParams = { libraryAction: "create" }

    render(<AddLibraryLocationScreen />)

    expect(screen.getByText("common.appInternalStorage")).toBeTruthy()
    expect(screen.getByText("common.localStorage")).toBeTruthy()
    fireEvent.press(screen.getByTestId("add-library-app-internal-storage"))
    expect(mockSetLocalFolder).toHaveBeenCalledWith(null)
    expect(mockPickLocalLibraryDirectory).not.toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledWith("/settings/add-library/create")
  })

  it("should pick an iOS directory for external local storage", async () => {
    const picked = {
      uri: "file:///external/Books",
      name: "Books",
      securityScopedBookmark: {
        bookmarkBase64: "bookmark",
        resolvedUri: "file:///external/Books",
        stale: false,
      },
    }
    mockParams = { libraryAction: "create" }
    mockPickLocalLibraryDirectory.mockResolvedValue(picked)

    render(<AddLibraryLocationScreen />)
    fireEvent.press(screen.getByTestId("add-library-local-storage"))

    await waitFor(() => expect(mockSetLocalFolder).toHaveBeenCalledWith(picked))
    expect(router.push).toHaveBeenCalledWith("/settings/add-library/create")
  })

  it("should open an existing iOS local library from the directory picker", async () => {
    const picked = {
      uri: "file:///external/Library",
      securityScopedBookmark: {
        bookmarkBase64: "bookmark",
        resolvedUri: "file:///external/Library",
        stale: false,
      },
    }
    mockParams = { libraryAction: "open" }
    mockPickLocalLibraryDirectory.mockResolvedValue(picked)
    mockOpenExistingLocalLibraryFromPicker.mockResolvedValue({
      id: "external",
      name: "External",
    })

    render(<AddLibraryLocationScreen />)
    expect(screen.queryByText("common.appInternalStorage")).toBeNull()
    fireEvent.press(screen.getByTestId("add-library-local-storage"))

    await waitFor(() =>
      expect(mockOpenExistingLocalLibraryFromPicker).toHaveBeenCalledWith(
        picked,
      ),
    )
    expect(mockDismissAddLibrary).toHaveBeenCalledTimes(1)
  })

  it("should hide external local storage on Android", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    })

    mockParams = { libraryAction: "create" }
    const { rerender } = render(<AddLibraryLocationScreen />)
    expect(screen.getByText("common.appInternalStorage")).toBeTruthy()
    expect(screen.queryByText("common.localStorage")).toBeNull()

    mockParams = { libraryAction: "open" }
    rerender(<AddLibraryLocationScreen />)
    expect(screen.queryByText("common.appInternalStorage")).toBeNull()
    expect(screen.queryByText("common.localStorage")).toBeNull()
  })

  it("should show data source choices without descriptions", () => {
    mockParams = { libraryAction: "open" }
    mockDataSources = [
      {
        id: "webdav-1",
        type: "webdav",
        name: "家庭存储",
        enabled: true,
        endpoint: "https://dav.example.com",
        username: "reader",
        hasPassword: true,
      },
      {
        id: "onedrive-1",
        type: "onedrive",
        name: "OneDrive",
        enabled: true,
        clientId: "client-id",
        displayName: "个人云盘",
        hasRefreshToken: true,
      },
    ]

    render(<AddLibraryLocationScreen />)

    expect(screen.getByText("addLibraryFlow.addWebdav.title")).toBeTruthy()
    expect(screen.getByText("addLibraryFlow.addOnedrive.title")).toBeTruthy()
    expect(
      screen.queryByText("addLibraryFlow.addWebdav.description"),
    ).toBeNull()
    expect(
      screen.queryByText("addLibraryFlow.addOnedrive.description"),
    ).toBeNull()

    const listRowMock = jest.requireMock("@/src/components")
      .ListRow as jest.Mock
    const rowProps = (title: string) =>
      listRowMock.mock.calls.find(([props]) => props.title === title)?.[0]

    expect(rowProps("家庭存储")?.icon).toBe(
      ENTITY_LIST_ROW_ICONS.webdavDataSource,
    )
    expect(rowProps("OneDrive")?.icon).toBe(
      ENTITY_LIST_ROW_ICONS.onedriveDataSource,
    )
    expect(rowProps("家庭存储")?.value).toBeUndefined()
    expect(rowProps("OneDrive")?.value).toBeUndefined()
  })
})

describe("CreateLibraryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" })
    mockParams = {}
    mockLocalFolder = null
    mockPendingImport = null
    mockDataSources = []
    mockCreateAppInternalMyReaderLibrary.mockResolvedValue({
      id: "library-1",
      name: "My Library",
    })
  })

  it("should create a local library without asking for a folder", async () => {
    render(<CreateLibraryScreen />)

    expect(screen.queryByText("common.localStorage")).toBeNull()

    fireEvent(screen.getByTestId("new-library-name"), "submitEditing")

    await waitFor(() => {
      expect(mockCreateAppInternalMyReaderLibrary).toHaveBeenCalledWith(
        "My Library",
      )
    })
    expect(mockDismissAddLibrary).toHaveBeenCalledTimes(1)
    expect(mockNotifyLibraryAdded).toHaveBeenCalledWith("My Library")
  })

  it("should create inside the selected remote location without repeating it", async () => {
    const source: DataSource = {
      id: "onedrive-1",
      type: "onedrive",
      name: "OneDrive",
      enabled: true,
      clientId: "client-id",
      hasRefreshToken: true,
    }
    mockParams = {
      dataSourceId: source.id,
      sourcePath: "/Books",
    }
    mockDataSources = [source]
    mockCreateRemoteMyReaderLibrary.mockResolvedValue({
      id: "library-2",
      name: "My Library",
    })

    render(<CreateLibraryScreen />)

    expect(screen.queryByText("OneDrive")).toBeNull()
    expect(screen.queryByText("/Books")).toBeNull()

    fireEvent(screen.getByTestId("new-library-name"), "submitEditing")

    await waitFor(() => {
      expect(mockCreateRemoteMyReaderLibrary).toHaveBeenCalledWith(
        source,
        "/Books/My Library",
        "My Library",
      )
    })
  })

  it("should reject a local library name that cannot be used as one folder", () => {
    render(<CreateLibraryScreen />)

    const input = screen.getByTestId("new-library-name")
    fireEvent.changeText(input, "Nested/Library")
    fireEvent(input, "submitEditing")

    expect(mockCreateAppInternalMyReaderLibrary).not.toHaveBeenCalled()
  })

  it("should create an external library in the selected iOS folder", async () => {
    const picked = {
      uri: "file:///external/Books",
      name: "Books",
      securityScopedBookmark: {
        bookmarkBase64: "bookmark",
        resolvedUri: "file:///external/Books",
        stale: false,
      },
    }
    mockLocalFolder = picked
    mockCreateFolderMyReaderLibrary.mockResolvedValue({
      id: "external-library",
      name: "My Library",
    })

    render(<CreateLibraryScreen />)
    fireEvent(screen.getByTestId("new-library-name"), "submitEditing")

    await waitFor(() =>
      expect(mockCreateFolderMyReaderLibrary).toHaveBeenCalledWith(
        picked,
        "My Library",
      ),
    )
    expect(mockCreateAppInternalMyReaderLibrary).not.toHaveBeenCalled()
  })

  it("should continue a staged share after creating its library", async () => {
    mockPendingImport = {
      uri: "file:///cache/staged-book-imports/book.epub",
      originalName: "Book.epub",
    }
    render(<CreateLibraryScreen />)

    fireEvent(screen.getByTestId("new-library-name"), "submitEditing")

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith({
        pathname: "/handle-share",
        params: {
          contentUri: "file:///cache/staged-book-imports/book.epub",
          libraryId: "library-1",
          originalName: "Book.epub",
        },
      })
    })
    expect(mockTakePendingImport).toHaveBeenCalledTimes(1)
    expect(mockDismissAddLibrary).not.toHaveBeenCalled()
    expect(mockNotifyLibraryAdded).not.toHaveBeenCalled()
  })
})
