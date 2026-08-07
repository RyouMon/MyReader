import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import { router } from "expo-router"
import * as mockReact from "react"
import {
  Text as mockText,
  TextInput as mockTextInput,
  View as mockView,
} from "react-native"

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
let mockLocalFolder: {
  name: string
  uri: string
} | null = null
let mockPendingImport: { originalName?: string; uri: string } | null = null
let mockDataSources: DataSource[] = []
const mockCreateFolderMyReaderLibrary = jest.fn()
const mockCreateRemoteMyReaderLibrary = jest.fn()
const mockDismissAddLibrary = jest.fn()
const mockNotifyLibraryAdded = jest.fn()
const mockUseScreenHeader = jest.fn((_options: unknown) => ({
  options: {},
  toolbar: null,
}))
const mockSetLocalFolder = jest.fn((folder) => {
  mockLocalFolder = folder
})
const mockSetPendingImport = jest.fn((pendingImport) => {
  mockPendingImport = pendingImport
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
  ListRow: jest.fn(
    ({
      detail,
      title,
      value,
    }: {
      detail?: string
      title: string
      value?: string
    }) =>
      mockReact.createElement(
        mockView,
        null,
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

jest.mock("@/src/domain/library/local-library-picker", () => ({
  pickLocalLibraryDirectory: jest.fn(),
}))

jest.mock("@/src/domain/library/hooks/library-actions", () => ({
  createFolderMyReaderLibrary: (...args: unknown[]) =>
    mockCreateFolderMyReaderLibrary(...args),
  createRemoteMyReaderLibrary: (...args: unknown[]) =>
    mockCreateRemoteMyReaderLibrary(...args),
  nextMyReaderLibraryName: () => "My Library",
  openExistingLocalLibraryFromPicker: jest.fn(),
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
})

describe("AddLibraryLocationScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLocalFolder = null
    mockPendingImport = null
    mockDataSources = []
  })

  it.each([
    "create",
    "open",
  ])("should use local storage as the single local source when %s", (libraryAction) => {
    mockParams = { libraryAction }

    render(<AddLibraryLocationScreen />)

    expect(screen.getByText("common.localStorage")).toBeTruthy()
    expect(screen.queryByText("addLibrary.appStorage")).toBeNull()
    expect(screen.queryByText("addLibrary.folder")).toBeNull()
  })
})

describe("CreateLibraryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockParams = {}
    mockLocalFolder = {
      name: "Selected Folder",
      uri: "file:///external/Selected Folder",
    }
    mockPendingImport = null
    mockDataSources = []
    mockCreateFolderMyReaderLibrary.mockResolvedValue({
      id: "library-1",
      name: "My Library",
    })
  })

  it("should create in the selected folder instead of app storage", async () => {
    const selectedFolder = mockLocalFolder
    render(<CreateLibraryScreen />)

    expect(screen.getByText("common.localStorage")).toBeTruthy()
    expect(screen.getByText("Selected Folder")).toBeTruthy()

    fireEvent(screen.getByTestId("new-library-name"), "submitEditing")

    await waitFor(() => {
      expect(mockCreateFolderMyReaderLibrary).toHaveBeenCalledWith(
        selectedFolder,
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

    expect(mockCreateFolderMyReaderLibrary).not.toHaveBeenCalled()
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
