import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { fireEvent, render } from "@testing-library/react-native"
import { StyleSheet } from "react-native"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import ReaderSearchSheet, {
  type ReaderSearchSheetProps,
} from "./ReaderSearchSheet"

jest.mock("@expo/ui/community/bottom-sheet", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    BottomSheetModal: mockReact.forwardRef(function BottomSheetModalMock(
      { children, ...props }: { children: React.ReactNode },
      _ref: React.Ref<unknown>,
    ) {
      return mockReact.createElement(
        mockReactNative.View,
        { ...props, testID: "reader-search-sheet" },
        children,
      )
    }),
    BottomSheetFlatList: (props: object) =>
      mockReact.createElement(mockReactNative.FlatList, props),
    BottomSheetTextInput: mockReactNative.TextInput,
  }
})

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const suffix = values
        ? `:${Object.values(values)
            .map((value) => String(value))
            .join(":")}`
        : ""
      return `${key}${suffix}`
    },
  }),
}))

jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
)

jest.mock("./ReaderChromeIcon", () => ({
  ReaderChromeIcon: () => null,
}))

jest.mock("@/src/components/ui", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    EmptyState: jest.fn(({ title, detail, action }) =>
      mockReact.createElement(
        mockReactNative.View,
        null,
        mockReact.createElement(mockReactNative.Text, null, title),
        mockReact.createElement(mockReactNative.Text, null, detail),
        action,
      ),
    ),
  }
})

const palette = readerChromePalette("#2C2420", "#F5EFE9")

function locator(): ReaderLocator {
  return {
    href: "chapter.xhtml",
    type: "application/xhtml+xml",
    title: "Chapter one",
    locations: { progression: 0.2, position: 2 },
    text: {
      before: "Before ",
      highlight: "needle",
      after: " after",
    },
  }
}

const baseProps: ReaderSearchSheetProps = {
  status: "idle",
  query: "",
  locators: [],
  toc: [],
  positions: [],
  done: true,
  hasMore: false,
  loadingMore: false,
  loadMoreError: false,
  palette,
  onSearch: jest.fn(),
  onClear: jest.fn(),
  onLoadMore: jest.fn(),
  onSelectResult: jest.fn(),
  onDismiss: jest.fn(),
}

describe("ReaderSearchSheet", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should use the standard empty state when no search has been submitted", () => {
    const screen = render(<ReaderSearchSheet {...baseProps} />)

    expect(screen.getByText("reader.search.promptTitle")).toBeTruthy()
    expect(screen.getByText("reader.search.prompt")).toBeTruthy()
  })

  it("should use the standard empty state when a search has no results", () => {
    const screen = render(
      <ReaderSearchSheet {...baseProps} status="empty" query="needle" />,
    )

    expect(screen.getByText("reader.search.empty:needle")).toBeTruthy()
    expect(screen.getByText("reader.search.emptyDetail")).toBeTruthy()
  })

  it("should show only one clear action without duplicate search or close buttons", () => {
    const screen = render(<ReaderSearchSheet {...baseProps} query="needle" />)

    expect(screen.getByText("reader.search.title")).toBeTruthy()
    expect(screen.getByLabelText("reader.search.clear")).toBeTruthy()
    expect(screen.queryByLabelText("reader.search.submit")).toBeNull()
    expect(screen.queryByLabelText("common.close")).toBeNull()
  })

  it("should submit the entered query from the keyboard search action", () => {
    const onSearch = jest.fn()
    const screen = render(
      <ReaderSearchSheet {...baseProps} onSearch={onSearch} />,
    )

    const input = screen.getByLabelText("reader.search.inputLabel")
    fireEvent.changeText(input, "needle")
    fireEvent(input, "submitEditing")

    expect(onSearch).toHaveBeenCalledWith("needle")
  })

  it("should return the complete locator when a result is selected", () => {
    const resultLocator = locator()
    const onSelectResult = jest.fn()
    const screen = render(
      <ReaderSearchSheet
        {...baseProps}
        status="results"
        query="needle"
        locators={[resultLocator]}
        onSelectResult={onSelectResult}
      />,
    )

    expect(screen.getByText("needle")).toBeTruthy()
    fireEvent.press(screen.getByLabelText(/Chapter one/))

    expect(onSelectResult).toHaveBeenCalledWith(resultLocator)
  })

  it("should emphasize matched text with the current theme accent", () => {
    const screen = render(
      <ReaderSearchSheet
        {...baseProps}
        status="results"
        query="needle"
        locators={[locator()]}
      />,
    )

    const matchStyle = StyleSheet.flatten(
      screen.getByText("needle").props.style,
    )

    expect(matchStyle).toEqual(
      expect.objectContaining({
        color: palette.accentText,
        fontWeight: "700",
      }),
    )
    expect(matchStyle).not.toHaveProperty("backgroundColor")
  })

  it("should label untitled search hits as body text", () => {
    const resultLocator = { ...locator(), title: undefined }
    const screen = render(
      <ReaderSearchSheet
        {...baseProps}
        status="results"
        query="needle"
        locators={[resultLocator]}
      />,
    )

    expect(screen.getByText("reader.search.resultTitle")).toBeTruthy()
  })

  it("should show the resolved chapter and target position when the hit omits them", () => {
    const resultLocator = {
      ...locator(),
      title: undefined,
      locations: { progression: 0.65 },
    }
    const positions = [
      {
        ...locator(),
        locations: { progression: 0.2, position: 12 },
      },
      {
        ...locator(),
        locations: { progression: 0.6, position: 13 },
      },
    ]
    const screen = render(
      <ReaderSearchSheet
        {...baseProps}
        status="results"
        query="needle"
        locators={[resultLocator]}
        positions={positions}
        toc={[
          {
            id: "chapter-one",
            label: "Resolved chapter",
            pageIndex: 0,
            href: "chapter.xhtml",
            locator: positions[0],
          },
        ]}
      />,
    )

    expect(screen.getByText("Resolved chapter")).toBeTruthy()
    expect(screen.getByText("13")).toBeTruthy()
    expect(screen.getByText("needle")).toBeTruthy()
  })

  it("should load more automatically when the result list reaches its end", () => {
    const onLoadMore = jest.fn()
    const screen = render(
      <ReaderSearchSheet
        {...baseProps}
        status="results"
        query="needle"
        locators={[locator()]}
        done={false}
        hasMore
        onLoadMore={onLoadMore}
      />,
    )

    fireEvent(screen.getByTestId("reader-search-results"), "endReached")

    expect(onLoadMore).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("reader.search.loadMore")).toBeNull()
  })

  it("should prefetch more results when the first page does not fill the list", () => {
    const onLoadMore = jest.fn()
    const screen = render(
      <ReaderSearchSheet
        {...baseProps}
        status="results"
        query="needle"
        locators={[locator()]}
        done={false}
        hasMore
        onLoadMore={onLoadMore}
      />,
    )

    fireEvent(screen.getByTestId("reader-search-results"), "layout", {
      nativeEvent: { layout: { height: 500 } },
    })

    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it("should mark the selected result when the sheet is reopened", () => {
    const selectedLocator = locator()
    const screen = render(
      <ReaderSearchSheet
        {...baseProps}
        status="results"
        query="needle"
        locators={[selectedLocator]}
        selectedLocator={selectedLocator}
      />,
    )

    expect(
      screen.getByLabelText(/Chapter one/).props.accessibilityState,
    ).toEqual({ selected: true })
  })

  it("should preserve the current query when the sheet is dismissed", () => {
    const onClear = jest.fn()
    const onDismiss = jest.fn()
    const screen = render(
      <ReaderSearchSheet
        {...baseProps}
        status="results"
        query="needle"
        locators={[locator()]}
        onClear={onClear}
        onDismiss={onDismiss}
      />,
    )
    const input = screen.getByLabelText("reader.search.inputLabel")

    fireEvent.changeText(input, "unsent edit")
    fireEvent(screen.getByTestId("reader-search-sheet"), "dismiss")

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onClear).not.toHaveBeenCalled()
    expect(input.props.value).toBe("needle")
  })

  it("should reset search only when the clear action is pressed", () => {
    const onClear = jest.fn()
    const screen = render(
      <ReaderSearchSheet
        {...baseProps}
        status="results"
        query="needle"
        locators={[locator()]}
        onClear={onClear}
      />,
    )

    fireEvent.press(screen.getByLabelText("reader.search.clear"))

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText("reader.search.inputLabel").props.value).toBe(
      "",
    )
  })

  it("should show only loaded count when pagination is incomplete", () => {
    const screen = render(
      <ReaderSearchSheet
        {...baseProps}
        status="results"
        query="needle"
        locators={[locator()]}
        resultCount={20}
        done={false}
        hasMore
      />,
    )

    expect(screen.getByText("reader.search.loadedCount:1")).toBeTruthy()
    expect(screen.queryByText("reader.search.resultCount:20")).toBeNull()

    screen.rerender(
      <ReaderSearchSheet
        {...baseProps}
        status="results"
        query="needle"
        locators={[locator()]}
        resultCount={20}
      />,
    )
    expect(screen.getByText("reader.search.resultCount:20")).toBeTruthy()
  })

  it("should use the standard empty state and retry when search fails", () => {
    const onSearch = jest.fn()
    const screen = render(
      <ReaderSearchSheet
        {...baseProps}
        status="error"
        query="needle"
        onSearch={onSearch}
      />,
    )

    expect(screen.getByText("reader.search.error")).toBeTruthy()
    expect(screen.getByText("reader.search.errorDetail")).toBeTruthy()
    fireEvent.press(screen.getByLabelText("reader.search.retry"))

    expect(onSearch).toHaveBeenCalledWith("needle")
  })
})
