import { fireEvent, render } from "@testing-library/react-native"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import type { ReaderAnnotationItem } from "./ReaderAnnotationList"
import ReaderAnnotationsSheet from "./ReaderAnnotationsSheet"

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
        { ...props, testID: "reader-annotations-bottom-sheet" },
        children,
      )
    }),
  }
})

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === "reader.annotations.title" ? "高亮和笔记" : key,
  }),
}))

jest.mock("./ReaderAnnotationList", () => ({
  ReaderAnnotationList: ({
    annotations,
    onSelect,
  }: {
    annotations: Array<{ excerpt: string }>
    onSelect: (item: { excerpt: string }) => void
  }) => {
    const mockReact = jest.requireActual("react")
    const mockReactNative = jest.requireActual("react-native")
    const annotation = annotations[0]!
    return mockReact.createElement(
      mockReactNative.Text,
      {
        accessibilityRole: "button",
        onPress: () => onSelect(annotation),
      },
      annotation.excerpt,
    )
  },
}))

const palette = readerChromePalette("#2C2420", "#F5EFE9")
const annotation: ReaderAnnotationItem = {
  id: "annotation-1",
  locator: {
    href: "chapter.xhtml",
    type: "application/xhtml+xml",
    locations: { progression: 0, position: 1 },
  },
  excerpt: "被高亮的正文",
  note: "这里很重要",
  color: "yellow",
  createdAt: 1,
}

describe("ReaderAnnotationsSheet", () => {
  it("should show highlights and notes in a dedicated sheet", () => {
    const onSelect = jest.fn()
    const screen = render(
      <ReaderAnnotationsSheet
        annotations={[annotation]}
        loading={false}
        pending={false}
        error={false}
        palette={palette}
        onRetry={jest.fn()}
        onSelect={onSelect}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        onDismiss={jest.fn()}
      />,
    )

    expect(screen.getByText("高亮和笔记")).toBeTruthy()
    fireEvent.press(screen.getByRole("button", { name: "被高亮的正文" }))
    expect(onSelect).toHaveBeenCalledWith(annotation)
  })
})
