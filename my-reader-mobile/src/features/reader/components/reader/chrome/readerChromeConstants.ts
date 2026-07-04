import type { ReaderTheme } from "@/src/store/app-store.types"

export type ThemeOption = {
  key: ReaderTheme
  swatch: string
  fg: string
  label: string
}

export const READER_FLOATING_BUTTON_SIZE = 52
export const READER_FLOATING_BUTTON_RADIUS = READER_FLOATING_BUTTON_SIZE / 2
export const READER_FLOATING_BUTTON_RIGHT = 32
export const READER_FLOATING_BUTTON_BOTTOM = 32
export const READER_FLOATING_BUTTON_ICON_SIZE = 28
export const READER_FLOATING_BUTTON_HIT_SLOP = 4
export const READER_FLOATING_BUTTON_HIDDEN_SCALE = 0.85
export const READER_FLOATING_BUTTON_VISIBLE_SCALE = 1
export const READER_FLOATING_BUTTON_VISIBLE_DELAY_MS = 50
export const READER_FLOATING_BUTTON_ENTER_DURATION_MS = 200
export const READER_FLOATING_BUTTON_EXIT_DURATION_MS = 150
export const READER_FLOATING_BUTTON_SPRING_STIFFNESS = 260
export const READER_FLOATING_BUTTON_SPRING_DAMPING = 20
export const READER_FLOATING_BUTTON_PRESS_SCALE = 0.94
export const READER_FLOATING_BUTTON_PRESS_DURATION_MS = 100
export const READER_FLOATING_BUTTON_SHADOW_COLOR = "#000000"
export const READER_FLOATING_BUTTON_SHADOW_OPACITY = 0.18
export const READER_FLOATING_BUTTON_SHADOW_RADIUS = 10
export const READER_FLOATING_BUTTON_SHADOW_OFFSET_X = 0
export const READER_FLOATING_BUTTON_SHADOW_OFFSET_Y = 3
export const READER_FLOATING_BUTTON_ELEVATION = 8

export const READER_BOTTOM_ACTION_SIZE = READER_FLOATING_BUTTON_SIZE
export const READER_BOTTOM_ACTION_OFFSET = READER_FLOATING_BUTTON_BOTTOM

export const READER_EXPANDED_ACTION_RIGHT = READER_FLOATING_BUTTON_RIGHT
export const READER_EXPANDED_ACTION_BOTTOM_OFFSET =
  READER_FLOATING_BUTTON_SIZE + READER_FLOATING_BUTTON_BOTTOM - 20
export const READER_EXPANDED_ACTION_SAFE_BOTTOM_MIN = 12
export const READER_EXPANDED_ACTION_WIDTH_RATIO = 0.64
export const READER_EXPANDED_ACTION_MAX_WIDTH = 360
export const READER_EXPANDED_ACTION_RADIUS = READER_FLOATING_BUTTON_RADIUS
export const READER_EXPANDED_ACTION_PADDING_HORIZONTAL = 20
export const READER_EXPANDED_ACTION_PADDING_VERTICAL = 12
export const READER_EXPANDED_ACTION_ICON_SIZE = 28
export const READER_EXPANDED_ACTION_STACK_GAP = 8
export const READER_EXPANDED_ACTION_TEXT_GAP = 8
export const READER_EXPANDED_ACTION_SHEET_SHADOW_COLOR = "#000000"
export const READER_EXPANDED_ACTION_SHEET_SHADOW_OPACITY = 0.16
export const READER_EXPANDED_ACTION_SHEET_SHADOW_RADIUS = 14
export const READER_EXPANDED_ACTION_SHEET_SHADOW_OFFSET_X = 0
export const READER_EXPANDED_ACTION_SHEET_SHADOW_OFFSET_Y = 4
export const READER_EXPANDED_ACTION_SHEET_ELEVATION = 8
export const READER_THEME_CHECK_ICON_SIZE = 12

export const READER_SHEET_RADIUS = 20
export const READER_SHEET_SHADOW_COLOR = "#000000"
export const READER_SHEET_SHADOW_OPACITY = 0.14
export const READER_SHEET_SHADOW_RADIUS = 18
export const READER_SHEET_SHADOW_OFFSET_X = 0
export const READER_SHEET_SHADOW_OFFSET_Y = -4
export const READER_SHEET_ELEVATION = 10
export const READER_TOC_SHEET_MAX_HEIGHT_RATIO = 0.85
export const READER_TOC_SHEET_SNAP_POINT = `${READER_TOC_SHEET_MAX_HEIGHT_RATIO * 100}%`
export const READER_TOC_SHEET_SNAP_POINTS: Array<string | number> = [
  READER_TOC_SHEET_SNAP_POINT,
]
export const READER_TOC_SHEET_INITIAL_INDEX = 0

export function readerExpandedActionWidth(windowWidth: number) {
  return Math.min(
    windowWidth * READER_EXPANDED_ACTION_WIDTH_RATIO,
    READER_EXPANDED_ACTION_MAX_WIDTH,
  )
}

export const READER_THEME_OPTIONS: ThemeOption[] = [
  {
    key: "neutral",
    swatch: "#FFFFFF",
    fg: "#2C2420",
    label: "reader.themeNeutral",
  },
  {
    key: "paper",
    swatch: "#F5EDDF",
    fg: "#5B4636",
    label: "reader.themePaper",
  },
  {
    key: "sepia",
    swatch: "#F1E7D0",
    fg: "#5F4B37",
    label: "reader.themeSepia",
  },
  {
    key: "green",
    swatch: "#CCE8CC",
    fg: "#2D4A2D",
    label: "reader.themeGreen",
  },
  {
    key: "ocean",
    swatch: "#D0E0F0",
    fg: "#2D3E5F",
    label: "reader.themeOcean",
  },
  {
    key: "contrast1",
    swatch: "#F5E6D3",
    fg: "#1A1A1A",
    label: "reader.themeContrast1",
  },
  {
    key: "night",
    swatch: "#2C2420",
    fg: "#D4CBC3",
    label: "reader.themeNight",
  },
  {
    key: "contrast2",
    swatch: "#000000",
    fg: "#CCCCCC",
    label: "reader.themeContrast2",
  },
]
