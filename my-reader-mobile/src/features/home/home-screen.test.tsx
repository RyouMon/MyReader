import { fireEvent, render, screen } from "@testing-library/react-native"
import { router } from "expo-router"
import * as mockReact from "react"
import {
  Pressable as mockPressable,
  Text as mockText,
  View as mockView,
} from "react-native"

import HomeScreen from "./home-screen"

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock("@/src/components", () => ({
  EmptyState: jest.fn(
    ({
      action,
      detail,
      title,
    }: {
      action?: mockReact.ReactNode
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
  PrimaryButton: jest.fn(
    ({ onPress, title }: { onPress: () => void; title: string }) =>
      mockReact.createElement(
        mockPressable,
        { onPress },
        mockReact.createElement(mockText, null, title),
      ),
  ),
  Screen: jest.fn(({ children }: { children: mockReact.ReactNode }) =>
    mockReact.createElement(mockView, null, children),
  ),
  SectionLabel: jest.fn(() => null),
}))

jest.mock("@/src/domain/library/hooks/use-book-reading-format", () => ({
  useBookReadingFormat: jest.fn(() => ({
    selectedFormatById: {},
    setBookReadingFormat: jest.fn(),
  })),
}))

jest.mock("@/src/domain/library/hooks/use-book-reading-progress", () => ({
  useBookReadingProgress: jest.fn(() => ({ data: {} })),
}))

jest.mock("@/src/domain/library/hooks/use-favorite-books", () => ({
  useFavoriteBooks: jest.fn(() => ({
    favoriteSet: new Set(),
    toggleFavorite: jest.fn(),
  })),
}))

jest.mock("@/src/domain/types", () => ({
  isRemoteSourceType: jest.fn(() => false),
}))

jest.mock("@/src/features/home/components", () => ({
  ContinueReadingCard: jest.fn(() => null),
  ReadingShelf: jest.fn(() => null),
  ReadingStatisticsCard: jest.fn(() => null),
}))

jest.mock("@/src/features/library/hooks/use-book-actions", () => ({
  useBookActions: jest.fn(() => ({
    handleBookMenuAction: jest.fn(),
    handleBookPress: jest.fn(),
  })),
}))

jest.mock("@/src/features/library/hooks/useLibraryQuery", () => ({
  useBooks: jest.fn(() => ({ data: [] })),
}))

jest.mock("@/src/features/library/utils/book-menu", () => ({
  buildBookMenuActions: jest.fn(() => []),
}))

jest.mock("@/src/hooks/use-library-book-meta", () => ({
  useLibraryBookMeta: jest.fn(() => ({
    bookFormatsById: {},
    bookFormatMetaById: new Map(),
    fileStateBundle: {},
    bookDownloadStatusById: {},
  })),
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: jest.fn((selector) =>
    selector({
      activeLibraryId: "library-1",
      libraries: [{ id: "library-1", name: "Library" }],
      settings: { homeCardStyle: "adaptive" },
    }),
  ),
}))

jest.mock("./hooks/use-recently-read-books", () => ({
  useRecentlyReadBooks: jest.fn(() => []),
}))

describe("HomeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should guide the reader to the library when there is no reading history", () => {
    render(<HomeScreen />)

    expect(screen.getByText("home.noReadingHistory.title")).toBeTruthy()
    expect(screen.getByText("home.noReadingHistory.detail")).toBeTruthy()
    expect(screen.queryByText("home.noBooks.title")).toBeNull()

    fireEvent.press(screen.getByText("home.noReadingHistory.action"))

    expect(router.push).toHaveBeenCalledWith("/library")
  })
})
