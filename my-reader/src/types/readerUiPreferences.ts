import type { FixedLayoutSettings, ReaderSettings } from "@/components/reader/types"

/** 与 `config.json` 内 `readerUi` / Tauri `ReaderUiPreferences` 对齐。 */
export interface ReaderUiPreferencesPayload {
  version: number
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
