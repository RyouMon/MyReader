export const READER_THEME_PRESETS = [
  {
    key: "neutral",
    labelKey: "neutral",
    backgroundColor: "#fefefe",
    foregroundColor: "#000000",
  },
  {
    key: "paper",
    labelKey: "paper",
    backgroundColor: "#E9DDC8",
    foregroundColor: "#000000",
  },
  {
    key: "sepia",
    labelKey: "sepia",
    backgroundColor: "#faf4e8",
    foregroundColor: "#000000",
  },
  {
    key: "green",
    labelKey: "green",
    backgroundColor: "#C5E7CD",
    foregroundColor: "#000000",
  },
  {
    key: "ocean",
    labelKey: "ocean",
    backgroundColor: "#181842",
    foregroundColor: "#ffffff",
  },
  {
    key: "night",
    labelKey: "night",
    backgroundColor: "#121212",
    foregroundColor: "#ffffff",
  },
  {
    key: "contrast1",
    labelKey: "contrast1",
    backgroundColor: "#000000",
    foregroundColor: "#ffffff",
  },
  {
    key: "contrast2",
    labelKey: "contrast2",
    backgroundColor: "#000000",
    foregroundColor: "#FFFF00",
  },
] as const

export type ReaderThemePreset = (typeof READER_THEME_PRESETS)[number]
export type ReaderThemeKey = ReaderThemePreset["key"]

export const READER_THEME_KEYS = READER_THEME_PRESETS.map(
  (theme) => theme.key,
) as ReaderThemeKey[]

export const READER_THEME_PRESET_BY_KEY = Object.fromEntries(
  READER_THEME_PRESETS.map((theme) => [theme.key, theme]),
) as Record<ReaderThemeKey, ReaderThemePreset>

export function isReaderThemeKey(value: unknown): value is ReaderThemeKey {
  return typeof value === "string" && value in READER_THEME_PRESET_BY_KEY
}

export function readerThemePresetFor(
  value: unknown,
  fallback: ReaderThemeKey = "neutral",
): ReaderThemePreset {
  return isReaderThemeKey(value)
    ? READER_THEME_PRESET_BY_KEY[value]
    : READER_THEME_PRESET_BY_KEY[fallback]
}
