import { fireEvent, render, screen } from "@testing-library/react-native"
import { Children, type ReactElement, type ReactNode } from "react"
import { StyleSheet } from "react-native"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"

import { FontPicker, SliderControl, ThemeSwatches } from "./SettingControls"

jest.mock("@react-native-community/slider", () => {
  const mockReact = jest.requireActual("react")
  const mockReactNative = jest.requireActual("react-native")
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      mockReact.createElement(mockReactNative.View, props),
  }
})

jest.mock("@/src/design/reader-chrome-palette", () => ({
  mixInk: jest.fn((_ink: string, bg: string) => bg),
  underlayFromSurface: jest.fn((surface: string) => surface),
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

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

type StyledElement = ReactElement<{ children?: ReactNode; style?: unknown }>
type LayoutStyle = {
  flexBasis?: number
  flexDirection?: string
  flexShrink?: number
  minWidth?: number
}

describe("SettingControls layout", () => {
  it("should_render_four_theme_swatches_per_row_when_presets_fill_multiple_rows", () => {
    render(
      <ThemeSwatches value="missing" onChange={jest.fn()} palette={palette} />,
    )

    const grid = screen.getByTestId("theme-swatches-grid")
    const gridStyle = StyleSheet.flatten(grid.props.style)
    const rows = Children.toArray(grid.props.children) as StyledElement[]
    const firstRowStyle = StyleSheet.flatten(
      rows[0]?.props.style,
    ) as LayoutStyle
    const swatches = Children.toArray(
      rows[0]?.props.children,
    ) as StyledElement[]
    const swatchStyle = StyleSheet.flatten(
      swatches[0]?.props.style,
    ) as LayoutStyle

    expect(gridStyle.gap).toBe(8)
    expect(rows).toHaveLength(2)
    expect(firstRowStyle.flexDirection).toBe("row")
    expect(swatches).toHaveLength(4)
    expect(swatchStyle.flexBasis).toBe(0)
    expect(swatchStyle.flexShrink).toBe(1)
    expect(swatchStyle.minWidth).toBe(0)
  })

  it("should_keep_theme_labels_on_one_line_when_selection_uses_border", () => {
    render(
      <ThemeSwatches
        value="contrast1"
        onChange={jest.fn()}
        palette={palette}
      />,
    )

    const longLabel = screen.getByText("reader.themes.contrast1")
    const selectedButton = screen.getByLabelText(
      "reader.settingsTheme: reader.themes.contrast1, common.selected",
    )
    const labelStyle = StyleSheet.flatten(longLabel.props.style)
    const selectedStyle = StyleSheet.flatten(selectedButton.props.style)

    expect(longLabel.props.numberOfLines).toBe(1)
    expect(longLabel.props.adjustsFontSizeToFit).toBeUndefined()
    expect(longLabel.props.minimumFontScale).toBeUndefined()
    expect(longLabel.props.className).toContain("text-center")
    expect(longLabel.props.className).toContain("text-base")
    expect(labelStyle.paddingHorizontal).toBeUndefined()
    expect(selectedButton.props.accessibilityState).toEqual({ selected: true })
    expect(selectedStyle.borderColor).toBe(palette.accent)
  })

  it("should keep font options in a wrapping section when options are long", () => {
    render(
      <FontPicker
        options={[
          { key: "default", label: "Default Chinese" },
          { key: "noto-sans-sc", label: "Noto Sans CJK SC" },
          { key: "noto-serif-sc", label: "Noto Serif CJK SC" },
          { key: "open-dyslexic", label: "OpenDyslexic" },
        ]}
        value="default"
        onChange={jest.fn()}
        palette={palette}
      />,
    )

    const sectionStyle = StyleSheet.flatten(
      screen.getByTestId("font-picker-section").props.style,
    )
    const grid = screen.getByTestId("font-picker-grid")
    const gridStyle = StyleSheet.flatten(grid.props.style)
    const options = Children.toArray(grid.props.children) as StyledElement[]
    const optionStyle = StyleSheet.flatten(
      options[0]?.props.style,
    ) as LayoutStyle

    expect(sectionStyle.marginBottom).toBeGreaterThan(0)
    expect(gridStyle.flexWrap).toBe("wrap")
    expect(optionStyle.flexBasis).toBe("31%")
    expect(optionStyle.flexShrink).toBe(0)
  })
})

describe("SliderControl", () => {
  it("should commit the value only when sliding completes", () => {
    const onChange = jest.fn()
    render(
      <SliderControl
        label="字号"
        value={16}
        onChange={onChange}
        min={14}
        max={28}
        step={1}
        formatValue={(value) => `${value}px`}
        palette={palette}
      />,
    )

    const slider = screen.getByLabelText("字号")
    fireEvent(slider, "valueChange", 20)

    expect(screen.getByText("20px")).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()

    fireEvent(slider, "slidingComplete", 20)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(20)
  })
})
