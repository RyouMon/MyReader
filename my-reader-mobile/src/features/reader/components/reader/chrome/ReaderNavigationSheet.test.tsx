import type { Locator } from "@my-reader/readium"
import { MenuView } from "@react-native-menu/menu"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native"
import { Gesture } from "react-native-gesture-handler"

import {
  readerChromePalette,
  underlayFromSurface,
} from "@/src/design/reader-chrome-palette"
import ReaderNavigationSheet, {
  type ReaderBookmarkItem,
} from "./ReaderNavigationSheet"

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
    BottomSheetScrollView: mockReactNative.ScrollView,
  }
})

jest.mock("@react-native-menu/menu", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    MenuView: jest.fn(({ children }) =>
      mockReact.createElement(
        mockReactNative.View,
        { testID: "bookmark-menu-wrapper" },
        children,
      ),
    ),
  }
})

jest.mock("react-native-gesture-handler", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    Gesture: {
      Tap: jest.fn(() => {
        const gesture: Record<string, jest.Mock> = {}
        gesture.maxDuration = jest.fn(() => gesture)
        gesture.onBegin = jest.fn(() => gesture)
        gesture.onEnd = jest.fn(() => gesture)
        gesture.onFinalize = jest.fn(() => gesture)
        gesture.runOnJS = jest.fn(() => gesture)
        return gesture
      }),
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      mockReact.createElement(mockReactNative.View, null, children),
  }
})

jest.mock("@/tw", () => {
  const mockReactNative = jest.requireActual("react-native")
  return {
    Pressable: mockReactNative.Pressable,
    Text: mockReactNative.Text,
    TouchableHighlight: mockReactNative.TouchableHighlight,
    View: mockReactNative.View,
  }
})

jest.mock("@/src/components/ui", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    EmptyState: jest.fn(({ title, detail }) =>
      mockReact.createElement(
        mockReactNative.View,
        null,
        mockReact.createElement(mockReactNative.Text, null, title),
        mockReact.createElement(mockReactNative.Text, null, detail),
      ),
    ),
  }
})

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "zh-CN", resolvedLanguage: "zh-CN" },
    t: (key: string, values?: { count?: number; label?: string }) => {
      const translations: Record<string, string> = {
        "common.delete": "删除",
        "reader.bookmarks.deleteSelected": "删除所选书签",
        "reader.bookmarks.deselect": "取消选择",
        "reader.bookmarks.empty": "暂无书签",
        "reader.bookmarks.emptyDetail": "阅读时添加的书签会显示在这里",
        "reader.bookmarks.done": "完成",
        "reader.bookmarks.manage": "管理",
        "reader.bookmarks.select": "选择",
        "reader.bookmarks.selectedCount": `已选择 ${values?.count} 个书签`,
        "reader.bookmarks.today": "今天",
      }
      if (key === "reader.bookmarks.deleteLabel") {
        return `delete ${values?.label}`
      }
      return translations[key] ?? key
    },
  }),
}))

jest.mock("./ReaderChromeIcon", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    ReaderChromeIcon: ({ name }: { name: string }) =>
      mockReact.createElement(mockReactNative.View, {
        testID: `reader-chrome-icon-${name}`,
      }),
  }
})

const palette = readerChromePalette("#2C2420", "#F5EFE9")

function locator(position: number): Locator {
  return {
    href: `chapter-${position}.xhtml`,
    type: "application/xhtml+xml",
    locations: { progression: 0, position },
  }
}

function bookmark(position: number): ReaderBookmarkItem {
  return {
    id: `bookmark-${position}`,
    locator: locator(position),
    title: `Chapter ${position}`,
    positionLabel: `${position}`,
    createdAt: new Date(2026, 6, 9, 12).getTime(),
    active: position === 2,
  }
}

function getMenuProps(index = 0) {
  return (MenuView as unknown as jest.Mock).mock.calls[index]?.[0]
}

function getTapEnd(index = 0) {
  const tapGesture = (Gesture.Tap as jest.Mock).mock.results[index]?.value
  return tapGesture.onEnd.mock.calls[0]?.[0] as (
    event: unknown,
    success: boolean,
  ) => void
}

function getTapCallback(name: "onBegin" | "onFinalize", index = 0) {
  const tapGesture = (Gesture.Tap as jest.Mock).mock.results[index]?.value
  return tapGesture[name].mock.calls[0]?.[0] as () => void
}

function getBackgroundColor(instance: { props: { style?: unknown } }) {
  return StyleSheet.flatten(instance.props.style as StyleProp<ViewStyle>)
    ?.backgroundColor
}

const baseProps = {
  toc: [
    {
      id: "toc-1",
      label: "Chapter one",
      pageIndex: 0,
      locator: locator(1),
    },
  ],
  activeTocIndex: 0,
  bookmarks: [] as ReaderBookmarkItem[],
  bookmarksError: false,
  bookmarksLoading: false,
  bookmarksPending: false,
  palette,
  onRetryBookmarks: jest.fn(),
  onSelectTocItem: jest.fn(),
  onSelectBookmark: jest.fn(),
  onDeleteBookmark: jest.fn(),
  onDismiss: jest.fn(),
}

describe("ReaderNavigationSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should switch between table of contents and bookmarks", () => {
    const screen = render(<ReaderNavigationSheet {...baseProps} />)

    expect(screen.getByText("Chapter one")).toBeTruthy()
    fireEvent.press(screen.getByLabelText("reader.bookmarks.title"))

    expect(screen.getByText("暂无书签")).toBeTruthy()
    expect(screen.getByText("阅读时添加的书签会显示在这里")).toBeTruthy()
    const { EmptyState } = jest.requireMock("@/src/components/ui")
    expect(EmptyState.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        title: "暂无书签",
        detail: "阅读时添加的书签会显示在这里",
        layout: "container",
        colors: {
          icon: palette.textFaint,
          title: palette.text,
          detail: palette.textMuted,
        },
      }),
    )
  })

  it("should show the table of contents empty state when no items exist", () => {
    const screen = render(<ReaderNavigationSheet {...baseProps} toc={[]} />)

    expect(screen.getByText("reader.noToc")).toBeTruthy()
  })

  it("should show progress when bookmarks are loading", () => {
    const screen = render(
      <ReaderNavigationSheet {...baseProps} bookmarksLoading />,
    )

    fireEvent.press(screen.getByLabelText("reader.bookmarks.title"))

    expect(screen.getByLabelText("reader.bookmarks.loading")).toBeTruthy()
    expect(screen.queryByText("暂无书签")).toBeNull()
  })

  it("should refetch bookmarks when loading or mutation fails", () => {
    const onRetryBookmarks = jest.fn()
    const screen = render(
      <ReaderNavigationSheet
        {...baseProps}
        bookmarksError
        onRetryBookmarks={onRetryBookmarks}
      />,
    )
    fireEvent.press(screen.getByLabelText("reader.bookmarks.title"))

    expect(screen.getByText("reader.bookmarks.error")).toBeTruthy()
    fireEvent.press(screen.getByLabelText("reader.bookmarks.retry"))

    expect(onRetryBookmarks).toHaveBeenCalledTimes(1)
  })

  it("should navigate to the bookmark when a short tap succeeds", () => {
    const onSelectBookmark = jest.fn()
    const item = bookmark(2)
    const screen = render(
      <ReaderNavigationSheet
        {...baseProps}
        bookmarks={[item]}
        onSelectBookmark={onSelectBookmark}
      />,
    )
    fireEvent.press(screen.getByLabelText("reader.bookmarks.title"))

    expect(screen.getByText("Chapter 2")).toBeTruthy()
    expect(screen.getByText(/2026年7月9日.*星期四/)).toBeTruthy()
    expect(screen.getByText("2")).toBeTruthy()
    expect(screen.queryByLabelText("delete Chapter 2")).toBeNull()

    act(() => getTapEnd(0)({}, true))
    expect(onSelectBookmark).toHaveBeenCalledWith(item)

    act(() => getTapEnd(0)({}, false))
    expect(onSelectBookmark).toHaveBeenCalledTimes(1)
  })

  it("should match table-of-contents row colors when active and pressed", () => {
    const screen = render(
      <ReaderNavigationSheet {...baseProps} bookmarks={[bookmark(2)]} />,
    )

    expect(getBackgroundColor(screen.getByLabelText("Chapter one"))).toBe(
      palette.tocRowActive,
    )

    fireEvent.press(screen.getByLabelText("reader.bookmarks.title"))

    const activeBookmark = screen.getByLabelText(/Chapter 2/)
    expect(getBackgroundColor(activeBookmark)).toBe(palette.tocRowActive)
    expect(
      StyleSheet.flatten(screen.getByText("Chapter 2").props.style)?.color,
    ).toBe(palette.accentText)

    act(() => getTapCallback("onBegin")())
    expect(getBackgroundColor(screen.getByLabelText(/Chapter 2/))).toBe(
      underlayFromSurface(palette.tocRowActive, palette.bg),
    )

    act(() => getTapCallback("onFinalize")())
    expect(getBackgroundColor(screen.getByLabelText(/Chapter 2/))).toBe(
      palette.tocRowActive,
    )
  })

  it("should align position typography with the chapter title when bookmarks exist", () => {
    const screen = render(
      <ReaderNavigationSheet {...baseProps} bookmarks={[bookmark(2)]} />,
    )
    fireEvent.press(screen.getByLabelText("reader.bookmarks.title"))

    expect(screen.getByText("Chapter 2").props.className).toContain("text-base")
    expect(screen.getByText("2").props.className).toContain("text-base")
    expect(screen.getByText("2").props.className).not.toContain("pt-1")
  })

  it("should show a page number as the primary label without a trailing position", () => {
    const item = {
      ...bookmark(14),
      title: "第 14 页",
      positionLabel: "",
    }
    const screen = render(
      <ReaderNavigationSheet {...baseProps} bookmarks={[item]} />,
    )
    fireEvent.press(screen.getByLabelText("reader.bookmarks.title"))

    expect(screen.getAllByText("第 14 页")).toHaveLength(1)
    expect(screen.getByLabelText(/^第 14 页,/)).toBeTruthy()
  })

  it("should toggle selection without a menu when management is active", async () => {
    const onDeleteBookmark = jest.fn().mockResolvedValue(true)
    const items = [bookmark(2), bookmark(3)]
    const screen = render(
      <ReaderNavigationSheet
        {...baseProps}
        bookmarks={items}
        onDeleteBookmark={onDeleteBookmark}
      />,
    )
    fireEvent.press(screen.getByLabelText("reader.bookmarks.title"))

    expect(screen.getAllByTestId("bookmark-menu-wrapper")).toHaveLength(2)

    const manageButton = screen.getByLabelText("管理")
    expect(manageButton.props.className).toContain("h-11")
    expect(manageButton.props.className).toContain("w-11")
    expect(screen.getByTestId("reader-chrome-icon-manage")).toBeTruthy()
    expect(screen.queryByText("管理")).toBeNull()

    fireEvent.press(manageButton)
    expect(screen.getByText("已选择 0 个书签")).toBeTruthy()
    expect(screen.queryAllByTestId("bookmark-menu-wrapper")).toHaveLength(0)

    const doneButton = screen.getByLabelText("完成")
    expect(doneButton.props.className).toContain("h-11")
    expect(doneButton.props.className).toContain("w-11")
    expect(screen.getByTestId("reader-chrome-icon-check")).toBeTruthy()
    expect(screen.queryByText("完成")).toBeNull()

    const deleteButton = screen.getByLabelText("删除所选书签")
    expect(deleteButton.props.className).toContain("h-11")
    expect(deleteButton.props.className).toContain("w-11")
    expect(screen.getByTestId("reader-chrome-icon-delete")).toBeTruthy()

    fireEvent.press(screen.getByLabelText(/Chapter 2/))
    expect(screen.getByText("已选择 1 个书签")).toBeTruthy()

    fireEvent.press(screen.getByLabelText(/Chapter 2/))
    expect(screen.getByText("已选择 0 个书签")).toBeTruthy()

    fireEvent.press(screen.getByLabelText(/Chapter 2/))
    fireEvent.press(screen.getByLabelText(/Chapter 3/))
    expect(screen.getByText("已选择 2 个书签")).toBeTruthy()

    fireEvent.press(deleteButton)
    await waitFor(() => {
      expect(onDeleteBookmark).toHaveBeenNthCalledWith(1, items[0])
      expect(onDeleteBookmark).toHaveBeenNthCalledWith(2, items[1])
    })
    expect(screen.getByLabelText("管理")).toBeTruthy()
  })

  it("should delete one bookmark from the context menu", () => {
    const onDeleteBookmark = jest.fn()
    const item = bookmark(2)
    const screen = render(
      <ReaderNavigationSheet
        {...baseProps}
        bookmarks={[item]}
        onDeleteBookmark={onDeleteBookmark}
      />,
    )
    fireEvent.press(screen.getByLabelText("reader.bookmarks.title"))

    act(() => {
      getMenuProps(0).onPressAction({ nativeEvent: { event: "delete" } })
    })
    expect(onDeleteBookmark).toHaveBeenCalledWith(item)
  })

  it("should disable context-menu deletion when a mutation is pending", () => {
    const onDeleteBookmark = jest.fn()
    const item = bookmark(2)
    const screen = render(
      <ReaderNavigationSheet
        {...baseProps}
        bookmarks={[item]}
        bookmarksPending
        onDeleteBookmark={onDeleteBookmark}
      />,
    )
    fireEvent.press(screen.getByLabelText("reader.bookmarks.title"))

    const deleteAction = getMenuProps(0).actions.find(
      (action: { id: string }) => action.id === "delete",
    )
    expect(deleteAction.attributes).toEqual({
      destructive: true,
      disabled: true,
    })
    expect(onDeleteBookmark).not.toHaveBeenCalled()
  })

  it("should select a table of contents item from the navigation tab", () => {
    const onSelectTocItem = jest.fn()
    const screen = render(
      <ReaderNavigationSheet
        {...baseProps}
        onSelectTocItem={onSelectTocItem}
      />,
    )

    fireEvent.press(screen.getByLabelText("Chapter one"))

    expect(onSelectTocItem).toHaveBeenCalledWith(baseProps.toc[0])
  })

  it("should virtualize and position a long table of contents", () => {
    const toc = Array.from({ length: 100 }, (_, index) => ({
      id: `toc-${index}`,
      label: `Chapter ${index}`,
      pageIndex: index,
      locator: locator(index + 1),
    }))

    const screen = render(
      <ReaderNavigationSheet {...baseProps} toc={toc} activeTocIndex={80} />,
    )

    const { BottomSheetFlatList } = jest.requireMock(
      "@expo/ui/community/bottom-sheet",
    )
    const tocListProps = (BottomSheetFlatList as jest.Mock).mock.calls.find(
      ([props]) => props.data === toc,
    )?.[0]

    expect(tocListProps).toEqual(
      expect.objectContaining({
        initialScrollIndex: 80,
        initialNumToRender: 12,
        maxToRenderPerBatch: 12,
        windowSize: 5,
      }),
    )
    expect(tocListProps.getItemLayout(toc, 80)).toEqual({
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
