import type { FixedLayoutSettings, ReaderSettings } from "@/components/reader/types"

/** 与 `reader_ui_preferences.json` / Tauri `ReaderUiPreferences` 对齐。 */
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
}
