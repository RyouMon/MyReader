import { EpubPreferences, type EpubNavigator } from "@readium/navigator"

/** FXL / Divina：与 Readium `setPerPage` 对应的列数偏好（null = 自动横屏双页）。 */
export type SpreadPreference = "auto" | "single" | "double"

const SPREAD_VALUES: readonly SpreadPreference[] = ["auto", "single", "double"]

/** 与 `config.json` 等外部数据对齐时的安全归一化。 */
export function normalizeSpreadPreference(value: unknown): SpreadPreference {
  return SPREAD_VALUES.includes(value as SpreadPreference) ? (value as SpreadPreference) : "auto"
}

/** 将版面偏好转为 Readium `EpubPreferences`（仅 `columnCount` 段）。 */
export function epubPreferencesForSpread(mode: SpreadPreference): EpubPreferences {
  if (mode === "auto") return new EpubPreferences({ columnCount: null })
  if (mode === "single") return new EpubPreferences({ columnCount: 1 })
  return new EpubPreferences({ columnCount: 2 })
}

/** 提交 FXL 双页/单页偏好并触发一次尺寸重算。 */
export async function applySpreadPreference(
  nav: EpubNavigator,
  mode: SpreadPreference,
): Promise<void> {
  await nav.submitPreferences(epubPreferencesForSpread(mode))
  await nav.resizeHandler()
}

/** 重排 EPUB：与 Thorium 对齐的 8 个主题。 */
export type ReflowThemePreset =
  | "neutral"
  | "sepia"
  | "night"
  | "paper"
  | "contrast1"
  | "contrast2"
  | "ocean"
  | "green"

const REFLOW_PRESETS: Record<ReflowThemePreset, EpubPreferences> = {
  neutral: new EpubPreferences({
    backgroundColor: "#fefefe",
    textColor: "#000000",
  }),
  sepia: new EpubPreferences({
    backgroundColor: "#faf4e8",
    textColor: "#000000",
  }),
  night: new EpubPreferences({
    backgroundColor: "#121212",
    textColor: "#ffffff",
  }),
  paper: new EpubPreferences({
    backgroundColor: "#E9DDC8",
    textColor: "#000000",
  }),
  contrast1: new EpubPreferences({
    backgroundColor: "#000000",
    textColor: "#ffffff",
  }),
  contrast2: new EpubPreferences({
    backgroundColor: "#000000",
    textColor: "#FFFF00",
  }),
  ocean: new EpubPreferences({
    backgroundColor: "#181842",
    textColor: "#ffffff",
  }),
  green: new EpubPreferences({
    backgroundColor: "#C5E7CD",
    textColor: "#000000",
  }),
}

/** 重排 EPUB 的底/字色预设（固定色值）。 */
export function epubPreferencesForReflowTheme(preset: ReflowThemePreset): EpubPreferences {
  return REFLOW_PRESETS[preset]
}
