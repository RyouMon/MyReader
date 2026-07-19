import { fireEvent, render } from "@testing-library/react-native"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import type { ReaderAnnotationEditorActionsProps } from "./ReaderAnnotationEditorActions.types"
import { ReaderAnnotationEditorSheet } from "./ReaderAnnotationEditorSheet"

let mockActionsProps: ReaderAnnotationEditorActionsProps | null = null

jest.mock("@expo/ui/community/bottom-sheet", () => {
  const mockReactNative = jest.requireActual("react-native")
  return {
    BottomSheetTextInput: mockReactNative.TextInput,
  }
})

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    danger: "#b44a3a",
    dangerSoft: "rgba(180, 74, 58, 0.14)",
  }),
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "zh-CN", resolvedLanguage: "zh-CN" },
    t: (key: string) => key,
  }),
}))

jest.mock("./ReaderChromeIcon", () => ({
  ReaderChromeIcon: () => null,
}))

jest.mock("./ReaderAnnotationEditorActions", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return function ReaderAnnotationEditorActionsMock(
    props: ReaderAnnotationEditorActionsProps,
  ) {
    mockActionsProps = props
    return mockReact.createElement(
      mockReactNative.View,
      null,
      props.showDelete
        ? mockReact.createElement(mockReactNative.Pressable, {
            accessibilityLabel: props.deleteLabel,
            onPress: props.onDelete,
          })
        : null,
      mockReact.createElement(mockReactNative.Pressable, {
        accessibilityLabel: props.saveLabel,
        disabled: props.pending || props.saveDisabled,
        style: { backgroundColor: props.saveColor },
        onPress: props.onSave,
      }),
    )
  }
})

jest.mock("./ReaderAnnotationEditorSheetContainer", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return mockReact.forwardRef(function ReaderAnnotationEditorSheetContainerMock(
    { children }: { children: React.ReactNode },
    _ref: React.Ref<unknown>,
  ) {
    return mockReact.createElement(mockReactNative.View, null, children)
  })
})

const palette = readerChromePalette("#2C2420", "#F5EFE9")
const baseProps = {
  pending: false,
  palette,
  onSave: jest.fn(() => Promise.resolve(true)),
  onDelete: jest.fn(() => Promise.resolve(true)),
  onDismiss: jest.fn(),
}

describe("ReaderAnnotationEditorSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockActionsProps = null
  })

  it("should show the quote and a read-only note when opening an existing annotation", () => {
    const screen = render(
      <ReaderAnnotationEditorSheet
        {...baseProps}
        draft={{
          key: "annotation",
          excerpt: "quoted passage",
          color: "green",
          note: "my note",
          createdAt: new Date("2026-07-17T14:34:00+08:00").getTime(),
          existing: true,
        }}
      />,
    )

    expect(screen.getByText("reader.annotations.title")).toBeTruthy()
    expect(screen.getByText("quoted passage")).toBeTruthy()
    expect(screen.getByText("my note")).toBeTruthy()
    expect(screen.queryByPlaceholderText(/.+/)).toBeNull()
  })

  it("should open a blank note editor when the empty note region is pressed", () => {
    const screen = render(
      <ReaderAnnotationEditorSheet
        {...baseProps}
        draft={{
          key: "new",
          excerpt: "quoted passage",
          color: "yellow",
          note: null,
          createdAt: Date.now(),
          existing: false,
        }}
      />,
    )

    expect(screen.queryByDisplayValue("")).toBeNull()
    fireEvent.press(screen.getByLabelText("reader.annotations.note"))
    expect(screen.getByDisplayValue("")).toBeTruthy()
    expect(screen.queryByPlaceholderText(/.+/)).toBeNull()
  })

  it("should save the current color and note when the RN save action is pressed", () => {
    const screen = render(
      <ReaderAnnotationEditorSheet
        {...baseProps}
        draft={{
          key: "annotation",
          excerpt: "quoted passage",
          color: "green",
          note: "my note",
          createdAt: Date.now(),
          existing: true,
        }}
      />,
    )

    fireEvent.press(screen.getByLabelText("common.save"))
    expect(baseProps.onSave).toHaveBeenCalledWith("green", "my note")
  })

  it("should hide the delete action when creating a new annotation", () => {
    const screen = render(
      <ReaderAnnotationEditorSheet
        {...baseProps}
        draft={{
          key: "new",
          excerpt: "quoted passage",
          color: "green",
          note: null,
          createdAt: Date.now(),
          existing: false,
        }}
      />,
    )

    expect(screen.queryByLabelText("common.delete")).toBeNull()
    expect(screen.getByLabelText("common.save")).toBeTruthy()
  })

  it("should use the reader accent fill for the primary save action", () => {
    const screen = render(
      <ReaderAnnotationEditorSheet
        {...baseProps}
        draft={{
          key: "annotation",
          excerpt: "quoted passage",
          color: "green",
          note: "my note",
          createdAt: Date.now(),
          existing: true,
        }}
      />,
    )

    expect(screen.getByLabelText("common.save")).toHaveStyle({
      backgroundColor: palette.accent,
    })
    expect(mockActionsProps?.saveColor).toBe(palette.accent)
  })
})
