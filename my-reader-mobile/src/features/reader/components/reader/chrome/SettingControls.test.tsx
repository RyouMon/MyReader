import { Children, type ReactElement } from "react"
import { StyleSheet } from "react-native"
import { render, screen } from "@testing-library/react-native"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"

import { FontPicker, ThemeSwatches } from "./SettingControls"

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

type StyledElement = ReactElement<{ style?: unknown }>
type LayoutStyle = {
  flexBasis?: string
  flexShrink?: number
}

describe("SettingControls layout", () => {
  it("should wrap theme swatches when the preset list fills multiple rows", () => {
    render(
      <ThemeSwatches value="missing" onChange={jest.fn()} palette={palette} />,
    )

    const grid = screen.getByTestId("theme-swatches-grid")
    const gridStyle = StyleSheet.flatten(grid.props.style)
    const swatches = Children.toArray(grid.props.children) as StyledElement[]
    const swatchStyle = StyleSheet.flatten(
      swatches[0]?.props.style,
    ) as LayoutStyle

    expect(gridStyle.flexWrap).toBe("wrap")
    expect(swatches.length).toBeGreaterThan(4)
    expect(swatchStyle.flexBasis).toBe("22%")
    expect(swatchStyle.flexShrink).toBe(0)
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
