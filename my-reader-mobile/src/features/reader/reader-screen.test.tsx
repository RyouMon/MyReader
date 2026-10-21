import type { Locator } from "@my-reader/readium"
import { act, cleanup, render } from "@testing-library/react-native"
import { router } from "expo-router"
import type { ComponentProps } from "react"
import { View as mockView } from "react-native"

import { setReadingProgress } from "@/src/domain/library/reading-progress"
import { defaultSettings } from "@/src/store/app-store.constants"
import type { ReaderPublicationSurface } from "./components/ReaderPublicationSurface"
import type { ReaderState } from "./components/reader/types"
import ReaderScreen from "./reader-screen"

const mockLibrary = {
  id: "local-library",
  name: "Local library",
  path: "file:///library",
  libraryType: "myreader",
  sourceType: "local",
}
const mockStore = {
  activeLibraryId: mockLibrary.id,
  libraries: [mockLibrary],
  settings: defaultSettings,
}
let mockSurface: ComponentProps<typeof ReaderPublicationSurface>

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ id: "7", format: "EPUB" }),
}))
jest.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: jest.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock("@expo/ui/community/bottom-sheet", () => ({
  BottomSheetModalProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}))
jest.mock("@/tw", () => ({
  View: mockView,
  Animated: { View: mockView },
}))
jest.mock("@/src/design/tokens", () => ({
  useTheme: () => ({ palette: { primary: "#C4622D" }, colorScheme: "light" }),
}))
jest.mock("@/src/store/app-store", () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
    { getState: () => mockStore },
  ),
}))
jest.mock("@/src/domain/library/reading-progress", () => ({
  setReadingProgress: jest.fn(),
}))
jest.mock("@/src/services/query/query-client", () => ({
  queryClient: { invalidateQueries: jest.fn() },
}))
jest.mock("@/src/hooks/use-book-loader", () => ({
  useBookLoader: () => ({
    loadState: {
      status: "ready",
      libraryId: mockLibrary.id,
      bookId: 7,
      format: "EPUB",
      title: "Book",
      authors: [],
      layoutMode: "reflowable",
      epubFileUri: "file:///book.epub",
    },
  }),
}))
jest.mock("@/src/hooks/use-reader-navigation-history", () => ({
  useReaderNavigationHistory: () => ({}),
}))
jest.mock(
  "@/src/domain/reading-statistics/hooks/use-reading-session-tracker",
  () => ({
    useReadingSessionTracker: jest.fn(),
  }),
)
jest.mock("./hooks/use-reader-bookmarks", () => ({
  useReaderBookmarks: () => ({ bookmarks: [] }),
}))
jest.mock("./hooks/use-reader-annotations", () => ({
  useReaderAnnotations: () => ({ annotations: [] }),
}))
jest.mock("./hooks/use-reader-search", () => ({
  useReaderSearch: () => ({ locators: [] }),
}))
jest.mock("./tts/use-reader-tts-session", () => ({
  useReaderTtsSession: () => ({ stop: jest.fn() }),
}))
jest.mock("./reader-open-transition", () => ({
  READER_BOOK_TRANSITION_MS: 360,
  setReaderCloseTransition: () => null,
}))
jest.mock("./components/ReaderPublicationSurface", () => ({
  ReaderPublicationSurface: (props: typeof mockSurface) => {
    mockSurface = props
    return null
  },
}))
jest.mock("./components/ReaderNavigationButtons", () => ({
  ReaderNavigationButtons: () => null,
}))
jest.mock("./components/ReaderScreenSettings", () => ({
  ReaderScreenSettings: () => null,
}))
jest.mock("./components/ReaderLoadState", () => ({
  ReaderLoadState: () => null,
  ReaderLoadingSurface: () => null,
  DomReaderFallback: () => null,
}))
jest.mock("./components/reader/chrome", () =>
  Object.fromEntries(
    [
      "ReaderActionsExpanded",
      "ReaderAnnotationEditorSheet",
      "ReaderBookmarkButton",
      "ReaderBookmarksAndNotesSheet",
      "ReaderCloseButton",
      "ReaderMoreButton",
      "ReaderNavigationSheet",
      "ReaderPositionLabel",
      "ReaderSearchSheet",
      "ReaderTtsControls",
      "ReaderTtsSettingsSheet",
    ].map((name) => [name, () => null]),
  ),
)

function position(page: number): ReaderState {
  return {
    ready: true,
    loading: false,
    error: null,
    currentPage: page,
    totalPages: 3,
    progress: page / 3,
    chapterTitle: "Chapter",
    locator: {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: page / 3 },
    },
  }
}

describe("ReaderScreen progress at the native boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(setReadingProgress).mockResolvedValue(undefined)
  })
  afterEach(() => {
    cleanup()
  })

  it("saves the native text anchor before a requested close navigates away", async () => {
    const precise: Locator = {
      ...position(1).locator!,
      locations: { cssSelector: "p:nth-of-type(2)" },
      text: { highlight: "Second page text" },
    }
    const capture = jest.fn().mockResolvedValue(precise)
    render(<ReaderScreen />)
    Object.assign(mockSurface.reflow.ref!, {
      current: { getBookmarkLocator: capture },
    })
    await act(() => mockSurface.reflow.onStateChange!(position(0)))
    await act(() => mockSurface.reflow.onStateChange!(position(1)))
    let finishSave!: () => void
    jest.mocked(setReadingProgress).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        }),
    )
    let closing!: Promise<void>
    await act(async () => {
      closing = Promise.resolve(mockSurface.reflow.onRequestClose!())
    })
    expect(capture).toHaveBeenCalledTimes(1)
    expect(setReadingProgress).toHaveBeenCalledWith(
      mockLibrary,
      7,
      "EPUB",
      precise,
      expect.any(Object),
    )
    expect(router.back).not.toHaveBeenCalled()
    await act(async () => {
      finishSave()
      await closing
    })
    expect(router.back).toHaveBeenCalledTimes(1)
  })

  it("still flushes the recorded position when the native reader has unmounted", async () => {
    render(<ReaderScreen />)
    await act(() => mockSurface.reflow.onStateChange!(position(0)))
    await act(() => mockSurface.reflow.onStateChange!(position(1)))
    await act(async () => {
      await mockSurface.reflow.onRequestClose!()
    })
    expect(setReadingProgress).toHaveBeenCalledWith(
      mockLibrary,
      7,
      "EPUB",
      position(1).locator,
      expect.any(Object),
    )
    expect(router.back).toHaveBeenCalledTimes(1)
  })
})
