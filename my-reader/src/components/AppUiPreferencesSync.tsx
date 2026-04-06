import { invoke, isTauri } from "@tauri-apps/api/core"
import { useEffect } from "react"

import type { ReaderUiPreferencesPayload } from "@/types/readerUiPreferences"
import { useAppUiStore } from "@/stores/appUiStore"

/**
 * 在 Tauri 下从应用数据目录的 `config.json`（readerUi 段）加载并写回；
 * 非 Tauri 环境仅标记 hydrated，使用内存默认值。
 */
export function AppUiPreferencesSync() {
  const hydrateReaderPreferences = useAppUiStore((s) => s.hydrateReaderPreferences)
  const markReaderPreferencesHydrated = useAppUiStore(
    (s) => s.markReaderPreferencesHydrated,
  )

  useEffect(() => {
    if (!isTauri()) {
      console.info(
        "Success to load reader UI preferences. reason: skipped (not in Tauri).",
      )
      markReaderPreferencesHydrated()
      return
    }
    let cancelled = false
    void (async () => {
      try {
        console.info("Start to load reader UI preferences from backend.")
        const prefs = await invoke<ReaderUiPreferencesPayload>(
          "get_reader_ui_preferences",
        )
        if (cancelled) return
        hydrateReaderPreferences(prefs)
        console.info(
          `Success to load reader UI preferences. version: ${prefs.version}`,
        )
      } catch (e) {
        console.error("Failed to load reader UI preferences. error:", e)
      } finally {
        if (!cancelled) markReaderPreferencesHydrated()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hydrateReaderPreferences, markReaderPreferencesHydrated])

  return null
}
