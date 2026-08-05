import { render, waitFor } from "@testing-library/react-native"
import { router } from "expo-router"
import * as mockReact from "react"
import { Text as mockText, View as mockView } from "react-native"
import {
  importBookFromFile,
  supportedBookExtension,
} from "@/src/domain/library/hooks/library-actions"
import type { Library } from "@/src/domain/types"
import {
  deleteStagedBookImport,
  stageBookImport,
} from "@/src/services/fs/staged-book-import"

import IncomingShareScreen from "./incoming-share-screen"

const mockClearSharedPayloads = jest.fn()
let mockParams: {
  contentUri?: string
  libraryId?: string
  originalName?: string
} = {}
let mockLibraries: Library[] = []
let mockActiveLibraryId: string | null = null
let mockResolvedSharedPayloads: {
  contentUri: string
  originalName?: string
}[] = []
let mockSharedPayloads: unknown[] = []

jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))

jest.mock("expo-file-system", () => ({
  File: jest.fn((uri: string) => ({
    delete: jest.fn(),
    exists: true,
    extension: `.${uri.split(".").at(-1) ?? ""}`,
    name: uri.split("/").at(-1) ?? "",
    uri,
  })),
}))

jest.mock("expo-sharing", () => ({
  useIncomingShare: () => ({
    clearSharedPayloads: mockClearSharedPayloads,
    error: null,
    isResolving: false,
    resolvedSharedPayloads: mockResolvedSharedPayloads,
    sharedPayloads: mockSharedPayloads,
  }),
}))

jest.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: jest.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("@/src/components", () => ({
  Button: jest.fn(({ title }: { title: string }) =>
    mockReact.createElement(mockText, null, title),
  ),
  EmptyState: jest.fn(
    ({
      action,
      detail,
      title,
    }: {
      action: mockReact.ReactNode
      detail: string
      title: string
    }) =>
      mockReact.createElement(
        mockView,
        null,
        mockReact.createElement(mockText, null, title),
        mockReact.createElement(mockText, null, detail),
        action,
      ),
  ),
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({ background: "#fff", primary: "#c4622d" }),
}))

jest.mock("@/src/domain/library/hooks/library-actions", () => ({
  importBookFromFile: jest.fn(),
  supportedBookExtension: jest.fn(() => ".epub"),
}))

jest.mock("@/src/services/fs/staged-book-import", () => ({
  deleteStagedBookImport: jest.fn(),
  stageBookImport: jest.fn(),
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeLibraryId: mockActiveLibraryId,
      libraries: mockLibraries,
    }),
  useAppStoreReady: () => true,
}))

describe("IncomingShareScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockParams = {}
    mockLibraries = []
    mockActiveLibraryId = null
    mockResolvedSharedPayloads = []
    mockSharedPayloads = []
    jest.mocked(supportedBookExtension).mockReturnValue(".epub")
  })

  it("should enter the normal create flow for the first shared book", async () => {
    mockResolvedSharedPayloads = [
      {
        contentUri: "file:///resolved/shared.epub",
        originalName: "Shared.epub",
      },
    ]
    mockSharedPayloads = [{}]
    jest.mocked(stageBookImport).mockResolvedValue({
      uri: "file:///cache/staged-book-imports/shared.epub",
      originalName: "Shared.epub",
    })

    render(<IncomingShareScreen />)

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith({
        pathname: "/settings/add-library/location",
        params: {
          libraryAction: "create",
          pendingShareName: "Shared.epub",
          pendingShareUri: "file:///cache/staged-book-imports/shared.epub",
        },
      })
    })
    expect(stageBookImport).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "file:///resolved/shared.epub" }),
      ".epub",
      "Shared.epub",
    )
    expect(importBookFromFile).not.toHaveBeenCalled()
    expect(mockClearSharedPayloads).toHaveBeenCalled()
  })

  it("should import a staged share into the newly created library", async () => {
    const library = {
      id: "library-1",
      name: "My Library",
      path: "file:///external/My Library",
      libraryType: "myreader",
      sourceType: "local",
      bookCount: 0,
    } as Library
    mockLibraries = [library]
    mockActiveLibraryId = library.id
    mockParams = {
      contentUri: "file:///cache/staged-book-imports/shared.epub",
      libraryId: library.id,
      originalName: "Shared.epub",
    }
    jest.mocked(importBookFromFile).mockResolvedValue({
      library,
      bookId: 1,
    })

    render(<IncomingShareScreen />)

    await waitFor(() => {
      expect(importBookFromFile).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: "file:///cache/staged-book-imports/shared.epub",
        }),
        library,
        "Shared.epub",
      )
    })
    expect(router.replace).toHaveBeenCalledWith("/library")
    expect(deleteStagedBookImport).toHaveBeenCalledWith(
      "file:///cache/staged-book-imports/shared.epub",
    )
    expect(stageBookImport).not.toHaveBeenCalled()
  })
})
