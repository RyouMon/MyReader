import type {
  FixedLayoutSettings,
  ReaderSettings,
} from "@/components/reader/types"

export type LibraryViewMode = "grid" | "list"
export type AppThemeMode = "light" | "dark" | "system"
export type ResolvedAppTheme = "light" | "dark"

/** 与 `config.json` 内 `readerUi` / Tauri `ReaderUiPreferences` 对齐。 */
export interface ReaderUiPreferencesPayload {
  version: number
  appTheme?: AppThemeMode
  libraryViewMode: LibraryViewMode
  fixedLayout: FixedLayoutSettings
  reflowable: {
    settings: ReaderSettings
    tts: {
      ttsConfigId: string
      ttsSpeed: number
    }
  }
  cache: {
    maxCacheSizeMB: number
    autoCleanupOnLaunch: boolean
  }
}
