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

/** 重排 EPUB：纸色 / 夜间（固定色值，避免依赖未持久化的主题管线）。 */
export type ReflowThemePreset = "paper" | "sepia" | "dark"

const REFLOW_PRESETS: Record<ReflowThemePreset, EpubPreferences> = {
  paper: new EpubPreferences({
    backgroundColor: "#fffef9",
    textColor: "#1a1a1a",
  }),
  sepia: new EpubPreferences({
    backgroundColor: "#f4ecd8",
    textColor: "#2c2416",
  }),
  dark: new EpubPreferences({
    backgroundColor: "#1a1a1a",
    textColor: "#e8e6e3",
  }),
}

/** 重排 EPUB 的底/字色预设（固定色值）。 */
export function epubPreferencesForReflowTheme(preset: ReflowThemePreset): EpubPreferences {
  return REFLOW_PRESETS[preset]
}

