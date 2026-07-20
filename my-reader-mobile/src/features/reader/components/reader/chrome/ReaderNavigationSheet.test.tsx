import type { Locator } from "@my-reader/readium"
import { fireEvent, render } from "@testing-library/react-native"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import ReaderNavigationSheet from "./ReaderNavigationSheet"

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
        { ...props, testID: "reader-navigation-bottom-sheet" },
        children,
      )
    }),
    BottomSheetFlatList: jest.fn((props) =>
      mockReact.createElement(mockReactNative.FlatList, props),
    ),
  }
})

jest.mock("@/tw", () => {
  const mockReactNative = jest.requireActual("react-native")
  return {
    Text: mockReactNative.Text,
    TouchableHighlight: mockReactNative.TouchableHighlight,
    View: mockReactNative.View,
  }
})

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const palette = readerChromePalette("#2C2420", "#F5EFE9")
const locator: Locator = {
  href: "chapter.xhtml",
  type: "application/xhtml+xml",
  locations: { progression: 0, position: 1 },
}
const toc = [{ id: "toc-1", label: "Chapter one", pageIndex: 0, locator }]

describe("ReaderNavigationSheet", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should expose only the table of contents", () => {
    const onSelectTocItem = jest.fn()
    const screen = render(
      <ReaderNavigationSheet
        toc={toc}
        activeTocIndex={0}
        palette={palette}
        onSelectTocItem={onSelectTocItem}
        onDismiss={jest.fn()}
      />,
    )

    expect(screen.getByRole("header").props.children).toBe("reader.toc")
    expect(screen.queryByRole("tab")).toBeNull()
    fireEvent.press(screen.getByLabelText("Chapter one"))
    expect(onSelectTocItem).toHaveBeenCalledWith(toc[0])
  })

  it("should show the table of contents empty state when no items exist", () => {
    const screen = render(
      <ReaderNavigationSheet
        toc={[]}
        activeTocIndex={0}
        palette={palette}
        onSelectTocItem={jest.fn()}
        onDismiss={jest.fn()}
      />,
    )

    expect(screen.getByText("reader.noToc")).toBeTruthy()
  })

  it("should virtualize and position a long table of contents", () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      id: `toc-${index}`,
      label: `Chapter ${index}`,
      pageIndex: index,
      locator: {
        ...locator,
        locations: { progression: index / 100, position: index + 1 },
      },
    }))
    const screen = render(
      <ReaderNavigationSheet
        toc={rows}
        activeTocIndex={80}
        palette={palette}
        onSelectTocItem={jest.fn()}
        onDismiss={jest.fn()}
      />,
    )
    const { BottomSheetFlatList } = jest.requireMock(
      "@expo/ui/community/bottom-sheet",
    )
    const listProps = (BottomSheetFlatList as jest.Mock).mock.calls[0][0]

    expect(listProps).toEqual(
      expect.objectContaining({
        initialScrollIndex: 80,
        initialNumToRender: 12,
        maxToRenderPerBatch: 12,
        windowSize: 5,
      }),
    )
    expect(listProps.getItemLayout(rows, 80)).toEqual({
      index: 80,
      length: 54,
      offset: 4320,
    })
    expect(screen.getByTestId("reader-navigation-bottom-sheet").props).toEqual(
      expect.objectContaining({
        enableDynamicSizing: false,
        snapPoints: ["100%"],
      }),
    )
  })
})
