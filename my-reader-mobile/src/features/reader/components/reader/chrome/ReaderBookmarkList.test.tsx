import type { Locator } from "@my-reader/readium"
import { MenuView } from "@react-native-menu/menu"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { Gesture } from "react-native-gesture-handler"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import {
  type ReaderBookmarkItem,
  ReaderBookmarkList,
} from "./ReaderBookmarkList"

jest.mock("@expo/ui/community/bottom-sheet", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    BottomSheetFlatList: jest.fn((props) =>
      mockReact.createElement(mockReactNative.FlatList, props),
    ),
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
    View: mockReactNative.View,
  }
})

jest.mock("@/src/components/ui", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    EmptyState: ({ title, detail }: { title: string; detail: string }) =>
      mockReact.createElement(
        mockReactNative.View,
        null,
        mockReact.createElement(mockReactNative.Text, null, title),
        mockReact.createElement(mockReactNative.Text, null, detail),
      ),
  }
})

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "zh-CN", resolvedLanguage: "zh-CN" },
    t: (key: string, values?: { count?: number }) => {
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

const baseProps = {
  bookmarks: [] as ReaderBookmarkItem[],
  error: false,
  loading: false,
  pending: false,
  palette,
  onRetry: jest.fn(),
  onSelect: jest.fn(),
  onDelete: jest.fn(),
}

describe("ReaderBookmarkList", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should show the bookmark empty state", () => {
    const screen = render(<ReaderBookmarkList {...baseProps} />)
    expect(screen.getByText("暂无书签")).toBeTruthy()
    expect(screen.getByText("阅读时添加的书签会显示在这里")).toBeTruthy()
  })

  it("should navigate when a short bookmark tap succeeds", () => {
    const onSelect = jest.fn()
    const item = bookmark(2)
    const screen = render(
      <ReaderBookmarkList
        {...baseProps}
        bookmarks={[item]}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByText("Chapter 2")).toBeTruthy()
    const tapGesture = (Gesture.Tap as jest.Mock).mock.results[0]!.value
    const onEnd = tapGesture.onEnd.mock.calls[0][0]
    act(() => onEnd({}, true))
    expect(onSelect).toHaveBeenCalledWith(item)
  })

  it("should delete one bookmark from its context menu", () => {
    const onDelete = jest.fn()
    const item = bookmark(2)
    render(
      <ReaderBookmarkList
        {...baseProps}
        bookmarks={[item]}
        onDelete={onDelete}
      />,
    )
    const menuProps = (MenuView as unknown as jest.Mock).mock.calls[0][0]
    act(() => menuProps.onPressAction({ nativeEvent: { event: "delete" } }))
    expect(onDelete).toHaveBeenCalledWith(item)
  })

  it("should select and delete multiple bookmarks in management mode", async () => {
    const items = [bookmark(2), bookmark(3)]
    const onDelete = jest.fn().mockResolvedValue(true)
    const screen = render(
      <ReaderBookmarkList
        {...baseProps}
        bookmarks={items}
        onDelete={onDelete}
      />,
    )
    fireEvent.press(screen.getByLabelText("管理"))
    fireEvent.press(screen.getByLabelText(/Chapter 2/))
    fireEvent.press(screen.getByLabelText(/Chapter 3/))
    expect(screen.getByText("已选择 2 个书签")).toBeTruthy()
    fireEvent.press(screen.getByLabelText("删除所选书签"))
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2))
    expect(onDelete).toHaveBeenNthCalledWith(1, items[0])
    expect(onDelete).toHaveBeenNthCalledWith(2, items[1])
  })
})
