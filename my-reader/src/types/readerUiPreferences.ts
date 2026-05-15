import type {
  FixedLayoutSettings,
  ReaderSettings,
} from "@/components/reader/types"

export type LibraryViewMode = "grid" | "list"

/** 与 `config.json` 内 `readerUi` / Tauri `ReaderUiPreferences` 对齐。 */
export interface ReaderUiPreferencesPayload {
  version: number
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
