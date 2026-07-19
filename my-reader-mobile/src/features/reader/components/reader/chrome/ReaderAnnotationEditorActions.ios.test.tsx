import { fireEvent, render } from "@testing-library/react-native"

import ReaderAnnotationEditorActions from "./ReaderAnnotationEditorActions.ios"

type ButtonRecord = {
  modifiers: { type: string; value: unknown }[]
  role?: string
  systemImage?: string
}

const mockButtons: Record<string, ButtonRecord> = {}

jest.mock("@expo/ui/swift-ui", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    Button: ({
      label,
      modifiers,
      onPress,
      role,
      systemImage,
    }: {
      label: string
      modifiers: ButtonRecord["modifiers"]
      onPress: () => void
      role?: string
      systemImage?: string
    }) => {
      mockButtons[label] = { modifiers, role, systemImage }
      return mockReact.createElement(mockReactNative.Pressable, {
        accessibilityLabel: label,
        onPress,
      })
    },
    Host: mockReactNative.View,
    HStack: mockReactNative.View,
    Spacer: mockReactNative.View,
  }
})

jest.mock("@expo/ui/swift-ui/modifiers", () => {
  const modifier = (type: string) => (value: unknown) => ({ type, value })
  return {
    buttonBorderShape: modifier("buttonBorderShape"),
    buttonStyle: modifier("buttonStyle"),
    controlSize: modifier("controlSize"),
    disabled: modifier("disabled"),
    labelStyle: modifier("labelStyle"),
    padding: modifier("padding"),
    tint: modifier("tint"),
  }
})

const baseProps = {
  deleteColor: "#b44a3a",
  deleteLabel: "Delete",
  deleteSurfaceColor: "rgba(180, 74, 58, 0.14)",
  pending: false,
  saveColor: "#b5651d",
  saveContentColor: "#faf5ef",
  saveDisabled: false,
  saveLabel: "Save",
  showDelete: true,
  onDelete: jest.fn(),
  onSave: jest.fn(),
}

describe("ReaderAnnotationEditorActions.ios", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    for (const key of Object.keys(mockButtons)) delete mockButtons[key]
  })

  it("should use native destructive and prominent button semantics when editing a note", () => {
    const screen = render(<ReaderAnnotationEditorActions {...baseProps} />)

    expect(mockButtons.Delete).toMatchObject({
      role: "destructive",
      systemImage: "trash",
    })
    expect(mockButtons.Save).toMatchObject({ systemImage: "checkmark" })
    expect(mockButtons.Save?.modifiers).toEqual(
      expect.arrayContaining([
        { type: "buttonStyle", value: "borderedProminent" },
        { type: "buttonBorderShape", value: "circle" },
        { type: "tint", value: baseProps.saveColor },
      ]),
    )

    fireEvent.press(screen.getByLabelText("Save"))
    expect(baseProps.onSave).toHaveBeenCalledTimes(1)
  })
})
