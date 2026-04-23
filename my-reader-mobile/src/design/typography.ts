/**
 * Mobile typography tokens.
 * Font families must match what is loaded via expo-font / system availability.
 * Display/heading: system serif stack (Noto Serif SC where available).
 * UI: system sans-serif stack.
 */

export const FONT_DISPLAY = "serif" as const;
export const FONT_UI = "system" as const;
export const FONT_MONO = "monospace" as const;

/** Text size scale (matches shared token source after sync) */
export const TEXT_SIZE = {
  xs: 12,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 22,
  "2xl": 24,
  "3xl": 28,
  "4xl": 30,
  "5xl": 32,
} as const;

/** Line height scale */
export const LINE_HEIGHT = {
  tight: 1.25,
  snug: 1.4,
  normal: 1.6,
  relaxed: 1.75,
  loose: 1.9,
} as const;

/** Letter spacing */
export const LETTER_SPACING = {
  tight: -0.5,
  normal: 0,
  wide: 0.3,
  wider: 0.6,
  widest: 1.2,
} as const;

/** Border radius scale (matches shared token source after sync) */
export const RADIUS = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 18,
  "2xl": 24,
  "3xl": 28,
  full: 9999,
} as const;

/** Touch target minimums */
export const TOUCH = {
  min: 44,
  btn: 48,
  row: 60,
  tab: 56,
} as const;
