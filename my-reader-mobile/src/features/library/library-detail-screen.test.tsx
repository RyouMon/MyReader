import type { Library } from "@my-reader/tools/types/library"
import { act, render, screen, waitFor } from "@testing-library/react-native"
import { router } from "expo-router"
import * as mockReact from "react"
import { Text as mockText, View as mockView } from "react-native"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { removeLibrary } from "@/src/domain/library/hooks/library-actions"

import LibraryDetailScreen from "./library-detail-screen"

const mockLibrary: Library = {
  id: "library-1",
  name: "MyReader Library",
  path: "file:///documents/libraries/library-1",
  libraryType: "myreader",
  sourceType: "local",
  bookCount: 12,
}

let mockLibraries: Library[] = [mockLibrary]
let mockDeleteAction: { label: string; onPress: () => void } | undefined

jest.mock("@expo/vector-icons/MaterialIcons", () => ({
  __esModule: true,
  default: jest.fn(() => null),
}))

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
  },
}))

jest.mock("expo-router", () => ({
  Stack: {
    Screen: jest.fn(() => null),
  },
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({ libraryId: mockLibrary.id })),
}))

jest.mock("expo-symbols", () => ({
  SymbolView: jest.fn(() => null),
}))

jest.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: jest.fn(() => ({
    background: "#fff",
    border: "#ddd",
    destructive: "#c00",
    primary: "#c4622d",
    surface: "#fff",
    text: "#111",
    textMuted: "#666",
  })),
}))

jest.mock("@/src/domain/library/hooks/library-actions", () => ({
  removeLibrary: jest.fn(),
  switchActiveLibrary: jest.fn(),
}))

jest.mock("@/src/domain/notifications/download-notifications", () => ({
  notifyLibraryRefresh: jest.fn(),
}))

jest.mock("@/src/domain/sync/hooks/use-sync-library", () => ({
  useSyncLibrary: jest.fn(() => ({
    isSyncing: false,
    syncNow: jest.fn(),
  })),
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: jest.fn((selector) =>
    selector({
      activeLibraryId: mockLibrary.id,
      dataSources: [],
      libraries: mockLibraries,
    }),
  ),
}))

jest.mock("@/src/components", () => ({
  EmptyState: jest.fn(({ detail, title }: { detail: string; title: string }) =>
    mockReact.createElement(
      mockView,
      null,
      mockReact.createElement(mockText, null, title),
      mockReact.createElement(mockText, null, detail),
    ),
  ),
  ListRow: jest.fn(({ detail, title }: { detail: string; title: string }) =>
    mockReact.createElement(
      mockView,
      null,
      mockReact.createElement(mockText, null, title),
      mockReact.createElement(mockText, null, detail),
    ),
  ),
  SectionCard: jest.fn(({ children }) =>
    mockReact.createElement(mockView, null, children),
  ),
}))

jest.mock("@/src/components/ui", () => ({
  Button: jest.fn(({ title }: { title: string }) =>
    mockReact.createElement(mockText, null, title),
  ),
  ButtonGroup: jest.fn(({ children }) =>
    mockReact.createElement(mockView, null, children),
  ),
}))

jest.mock("@/src/components/ui/screen", () => ({
  Screen: jest.fn(({ children }) =>
    mockReact.createElement(mockView, null, children),
  ),
}))

jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: jest.fn(
    ({ right }: { right?: { label: string; onPress: () => void }[] }) => {
      mockDeleteAction = right?.[0]
      return { options: {}, toolbar: null }
    },
  ),
}))

describe("LibraryDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDeleteAction = undefined
    mockLibraries = [mockLibrary]
  })

  it("should preserve details until dismissal when deleting the current library", async () => {
    let finishRemoval: (() => void) | undefined
    jest.mocked(removeLibrary).mockReturnValue(
      new Promise<void>((resolve) => {
        finishRemoval = resolve
      }),
    )

    const view = render(<LibraryDetailScreen />)

    act(() => {
      mockDeleteAction?.onPress()
    })
    expect(mockDeleteAction?.label).toBe("libraryDetail.deleteLibrary")
    expect(showAlertWithStatusBarRestore).toHaveBeenCalledWith(
      "libraryDetail.deleteLocal.title",
      "libraryDetail.deleteLocal.message",
      expect.any(Array),
    )
    const alertButtons = jest.mocked(showAlertWithStatusBarRestore).mock
      .calls[0]?.[2]
    const confirmButton = alertButtons?.find(
      (button) => button.style === "destructive",
    )

    act(() => {
      confirmButton?.onPress?.()
    })

    expect(removeLibrary).toHaveBeenCalledWith(mockLibrary.id)

    act(() => {
      mockLibraries = []
      view.rerender(<LibraryDetailScreen />)
    })

    expect(router.back).not.toHaveBeenCalled()
    expect(screen.queryByText("libraryDetail.notFound.title")).toBeNull()
    expect(screen.getByText(mockLibrary.name)).toBeTruthy()
    expect(screen.getByText("common.appInternalStorage")).toBeTruthy()

    await act(async () => {
      finishRemoval?.()
    })

    await waitFor(() => {
      expect(router.back).toHaveBeenCalledTimes(1)
    })
  })

  it("should preserve remote files when removing a remote library", () => {
    mockLibraries = [
      {
        ...mockLibrary,
        sourceType: "webdav",
        dataSourceId: "webdav-1",
      },
    ]

    render(<LibraryDetailScreen />)

    act(() => {
      mockDeleteAction?.onPress()
    })

    expect(mockDeleteAction?.label).toBe("libraryDetail.removeLibrary")
    expect(showAlertWithStatusBarRestore).toHaveBeenCalledWith(
      "libraryDetail.remove.title",
      "libraryDetail.remove.message",
      expect.any(Array),
    )
    expect(screen.getByText("libraryDetail.myreaderLibrary")).toBeTruthy()
    expect(screen.getByText("libraryDetail.typeWebdav")).toBeTruthy()
  })

  it("should remove an iOS external library without deleting its source", () => {
    mockLibraries = [
      {
        ...mockLibrary,
        path: "file:///external/Library",
        securityScopedBookmark: {
          bookmarkBase64: "bookmark",
          resolvedUri: "file:///external/Library",
          stale: false,
        },
      },
    ]

    render(<LibraryDetailScreen />)
    act(() => {
      mockDeleteAction?.onPress()
    })

    expect(mockDeleteAction?.label).toBe("libraryDetail.removeLibrary")
    expect(showAlertWithStatusBarRestore).toHaveBeenCalledWith(
      "libraryDetail.remove.title",
      "libraryDetail.remove.message",
      expect.any(Array),
    )
    expect(screen.getByText("common.localStorage")).toBeTruthy()
  })
})
