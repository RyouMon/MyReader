import { useCallback } from "react"

import type { ReaderSettings, ReaderTheme } from "@/components/reader/types"
import { useAppUiStore } from "@/stores/appUiStore"

/** 流式排版阅读器的主题、字体与版式等设置（全局 + 可持久化）。 */
export function useReflowReaderSettings() {
  const settings = useAppUiStore((s) => s.reflowable.settings)
  const patchReflowableSettings = useAppUiStore((s) => s.patchReflowableSettings)

  const updateSettings = useCallback(
    (patch: Partial<ReaderSettings>) => patchReflowableSettings(patch),
    [patchReflowableSettings],
  )

  const setTheme = useCallback(
    (theme: ReaderTheme) => patchReflowableSettings({ theme }),
    [patchReflowableSettings],
  )

  return { settings, updateSettings, setTheme }
}
