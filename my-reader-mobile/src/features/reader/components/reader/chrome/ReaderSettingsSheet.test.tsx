import { render, screen } from "@testing-library/react-native"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import ReaderSettingsSheet from "./ReaderSettingsSheet"

jest.mock("@expo/ui/community/bottom-sheet", () => {
  const mockReactNative = jest.requireActual("react-native")
  return {
    BottomSheetScrollView: mockReactNative.ScrollView,
  }
})

jest.mock("./ReaderSettingsSheetContainer", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return mockReact.forwardRef(function ReaderSettingsSheetContainerMock(
    { children, ...props }: { children: React.ReactNode },
    _ref: React.Ref<unknown>,
  ) {
    return mockReact.createElement(
      mockReactNative.View,
      { ...props, testID: "reader-settings-sheet-container" },
      children,
    )
  })
})

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("@/tw", () => {
  const mockReactNative = jest.requireActual("react-native")
  return {
    Text: mockReactNative.Text,
    View: mockReactNative.View,
  }
})

jest.mock("./SettingControls", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  const Control = () => mockReact.createElement(mockReactNative.View)
  return {
    FontPicker: Control,
    SegmentPicker: Control,
    SliderControl: Control,
    ThemeSwatches: Control,
  }
})

const palette: ReaderChromePalette = {
  accent: "#C4622D",
  accentText: "#C4622D",
  actionSurface: "#FFFFFF",
  actionText: "#1C1714",
  bg: "#F7F3EC",
  border: "#D8CEC2",
  handle: "#8B8177",
  progressFill: "#8B4A2C",
  progressText: "#FFFFFF",
  segmentActive: "#F2E2D5",
  segmentIdle: "#EEE8DF",
  sheetSurface: "#F7F3EC",
  sliderTrack: "#D8CEC2",
  stepperBtn: "#E9DED2",
  text: "#1C1714",
  textFaint: "#A79A8E",
  textMuted: "#5C5349",
  tocRowActive: "#F2E2D5",
  tocRowIdle: "#EEE8DF",
}

describe("ReaderSettingsSheet", () => {
  it("should pass the sheet surface when fixed layout is active", () => {
    const onDismiss = jest.fn()

    render(
      <ReaderSettingsSheet
        palette={palette}
        onDismiss={onDismiss}
        layout="fixed"
        fixed={{
          background: "auto",
          onBackgroundChange: jest.fn(),
          navigationMode: "horizontal",
          onNavigationModeChange: jest.fn(),
          readingProgression: "ltr",
          onReadingProgressionChange: jest.fn(),
          spread: "auto",
          onSpreadChange: jest.fn(),
        }}
      />,
    )

    expect(screen.getByTestId("reader-settings-sheet-container").props).toEqual(
      expect.objectContaining({
        backgroundColor: palette.sheetSurface,
        onDismiss,
      }),
    )
  })
})
