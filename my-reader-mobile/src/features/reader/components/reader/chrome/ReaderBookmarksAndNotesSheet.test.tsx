import { fireEvent, render } from "@testing-library/react-native"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import ReaderBookmarksAndNotesSheet from "./ReaderBookmarksAndNotesSheet"

jest.mock("@expo/ui/community/bottom-sheet", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    BottomSheetModal: mockReact.forwardRef(function BottomSheetModalMock(
      { children, ...props }: { children: React.ReactNode },
      _ref: React.Ref<unknown>,
    ) {
      return mockReact.createElement(mockReactNative.View, props, children)
    }),
  }
})

jest.mock("@/tw", () => {
  const mockReactNative = jest.requireActual("react-native")
  return {
    Pressable: mockReactNative.Pressable,
    Text: mockReactNative.Text,
    View: mockReactNative.View,
  }
})

jest.mock("./ReaderBookmarkList", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    ReaderBookmarkList: () =>
      mockReact.createElement(mockReactNative.Text, null, "bookmark-list"),
  }
})

jest.mock("./ReaderAnnotationList", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    ReaderAnnotationList: () =>
      mockReact.createElement(mockReactNative.Text, null, "note-list"),
  }
})

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "reader.annotations.title": "书签和高亮笔记",
        "reader.annotations.notesTab": "笔记",
        "reader.bookmarks.title": "书签",
      })[key] ?? key,
  }),
}))

const palette = readerChromePalette("#2C2420", "#F5EFE9")
const baseProps = {
  annotations: [],
  annotationsAvailable: true,
  annotationsLoading: false,
  annotationsPending: false,
  annotationsError: false,
  bookmarks: [],
  bookmarksError: false,
  bookmarksLoading: false,
  bookmarksPending: false,
  palette,
  onRetryAnnotations: jest.fn(),
  onSelectAnnotation: jest.fn(),
  onEditAnnotation: jest.fn(),
  onDeleteAnnotation: jest.fn(),
  onRetryBookmarks: jest.fn(),
  onSelectBookmark: jest.fn(),
  onDeleteBookmark: jest.fn(),
  onDismiss: jest.fn(),
}

describe("ReaderBookmarksAndNotesSheet", () => {
  it("should group bookmarks and notes under the combined title", () => {
    const screen = render(<ReaderBookmarksAndNotesSheet {...baseProps} />)

    expect(screen.getByRole("header").props.children).toBe("书签和高亮笔记")
    expect(screen.getByText("bookmark-list")).toBeTruthy()
    fireEvent.press(screen.getByRole("tab", { name: "笔记" }))
    expect(screen.getByText("note-list")).toBeTruthy()
  })

  it("should show bookmarks without tabs when notes are unavailable", () => {
    const screen = render(
      <ReaderBookmarksAndNotesSheet
        {...baseProps}
        annotationsAvailable={false}
      />,
    )

    expect(screen.queryByRole("tab")).toBeNull()
    expect(screen.getByText("bookmark-list")).toBeTruthy()
  })
})
