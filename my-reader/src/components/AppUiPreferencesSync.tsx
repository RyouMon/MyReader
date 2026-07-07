import { isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useEffect } from "react"
import { READER_PREFERENCES_REFRESH_EVENT } from "@/lib/readerPreferencesEvents"
import { api } from "@/lib/tauri-api"

import { useAppUiStore } from "@/stores/appUiStore"
import type { ReaderUiPreferencesPayload } from "@/types/readerUiPreferences"

/**
 * 在 Tauri 下从应用数据目录的 `config.json`（readerUi 段）加载并写回；
 * 非 Tauri 环境仅标记 hydrated，使用内存默认值。
 */
export function AppUiPreferencesSync() {
  const hydrateReaderPreferences = useAppUiStore(
    (s) => s.hydrateReaderPreferences,
  )
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
        const prefs = await api.getReaderUiPreferences()
        if (cancelled) return
        hydrateReaderPreferences(prefs as ReaderUiPreferencesPayload)
        if (prefs.cache?.autoCleanupOnLaunch) {
          await api.enforceCacheLimit()
        }
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

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const unlisten = listen(READER_PREFERENCES_REFRESH_EVENT, async () => {
      try {
        const prefs = await api.getReaderUiPreferences()
        if (cancelled) return
        hydrateReaderPreferences(prefs as ReaderUiPreferencesPayload)
        markReaderPreferencesHydrated()
      } catch (e) {
        console.error("Failed to refresh reader UI preferences. error:", e)
      }
    })
    return () => {
      cancelled = true
      unlisten.then((fn) => fn()).catch(() => {})
    }
  }, [hydrateReaderPreferences, markReaderPreferencesHydrated])

  return null
}
