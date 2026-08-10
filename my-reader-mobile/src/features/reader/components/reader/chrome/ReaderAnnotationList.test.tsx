import type { Locator } from "@my-reader/readium"
import { readerAnnotationTint } from "@my-reader/tools/reader-annotations"
import { MenuView } from "@react-native-menu/menu"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { Gesture } from "react-native-gesture-handler"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import {
  type ReaderAnnotationItem,
  ReaderAnnotationList,
} from "./ReaderAnnotationList"

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
        { testID: "annotation-menu-wrapper" },
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
        "reader.annotations.deleteSelected": "删除所选高亮笔记",
        "reader.annotations.deselect": "取消选择",
        "reader.annotations.done": "完成",
        "reader.annotations.edit": "编辑",
        "reader.empty.annotations.title": "还没有高亮或笔记",
        "reader.empty.annotations.detail": "请先选中文字，再添加高亮或笔记。",
        "reader.annotations.manage": "管理",
        "reader.annotations.select": "选择",
        "reader.annotations.selectedCount": `已选择 ${values?.count} 条高亮笔记`,
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

function locator(position: number, highlight: string): Locator {
  return {
    href: `chapter-${position}.xhtml`,
    type: "application/xhtml+xml",
    locations: { progression: 0, position },
    text: {
      before: "这是高亮之前的上下文，",
      highlight,
      after: "，这是高亮之后的上下文。",
    },
  }
}

function annotation(position: number): ReaderAnnotationItem {
  const excerpt = `重点内容 ${position}`
  return {
    id: `annotation-${position}`,
    locator: locator(position, excerpt),
    excerpt,
    note: position === 2 ? "我的笔记" : null,
    color: position === 2 ? "green" : "yellow",
    createdAt: new Date(2026, 6, 9, 12).getTime(),
  }
}

const baseProps = {
  annotations: [] as ReaderAnnotationItem[],
  error: false,
  loading: false,
  pending: false,
  palette,
  onRetry: jest.fn(),
  onSelect: jest.fn(),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
}

describe("ReaderAnnotationList", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should explain how to add the first highlight or note", () => {
    const screen = render(<ReaderAnnotationList {...baseProps} />)

    expect(screen.getByText("还没有高亮或笔记")).toBeTruthy()
    expect(screen.getByText("请先选中文字，再添加高亮或笔记。")).toBeTruthy()
  })

  it("should show surrounding context and the annotation color on highlighted text", () => {
    const item = annotation(2)
    const screen = render(
      <ReaderAnnotationList {...baseProps} annotations={[item]} />,
    )

    expect(screen.getByText(/这是高亮之前的上下文/)).toBeTruthy()
    expect(screen.getByText("2")).toBeTruthy()
    const highlightStyle = StyleSheet.flatten(
      screen.getByText("重点内容 2").props.style,
    )
    expect(highlightStyle).toEqual(
      expect.objectContaining({
        backgroundColor: `${readerAnnotationTint("green")}66`,
        color: palette.text,
        fontWeight: "600",
      }),
    )
  })

  it("should navigate when a short annotation tap succeeds", () => {
    const onSelect = jest.fn()
    const item = annotation(2)
    render(
      <ReaderAnnotationList
        {...baseProps}
        annotations={[item]}
        onSelect={onSelect}
      />,
    )

    const tapGesture = (Gesture.Tap as jest.Mock).mock.results[0]!.value
    const onEnd = tapGesture.onEnd.mock.calls[0][0]
    act(() => onEnd({}, true))

    expect(onSelect).toHaveBeenCalledWith(item)
  })

  it("should offer select edit and delete in the row context menu", () => {
    const onEdit = jest.fn()
    const onDelete = jest.fn()
    const item = annotation(2)
    render(
      <ReaderAnnotationList
        {...baseProps}
        annotations={[item]}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    )

    const menuProps = (MenuView as unknown as jest.Mock).mock.calls[0][0]
    expect(
      menuProps.actions.map((action: { id: string }) => action.id),
    ).toEqual(["select", "edit", "delete"])
    act(() => menuProps.onPressAction({ nativeEvent: { event: "edit" } }))
    act(() => menuProps.onPressAction({ nativeEvent: { event: "delete" } }))

    expect(onEdit).toHaveBeenCalledWith(item)
    expect(onDelete).toHaveBeenCalledWith(item)
  })

  it("should select and delete multiple annotations in management mode", async () => {
    const items = [annotation(2), annotation(3)]
    const onDelete = jest.fn().mockResolvedValue(true)
    const screen = render(
      <ReaderAnnotationList
        {...baseProps}
        annotations={items}
        onDelete={onDelete}
      />,
    )

    fireEvent.press(screen.getByLabelText("管理"))
    fireEvent.press(screen.getByLabelText(/重点内容 2/))
    fireEvent.press(screen.getByLabelText(/重点内容 3/))
    expect(screen.getByText("已选择 2 条高亮笔记")).toBeTruthy()
    fireEvent.press(screen.getByLabelText("删除所选高亮笔记"))

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2))
    expect(onDelete).toHaveBeenNthCalledWith(1, items[0])
    expect(onDelete).toHaveBeenNthCalledWith(2, items[1])
  })
})
