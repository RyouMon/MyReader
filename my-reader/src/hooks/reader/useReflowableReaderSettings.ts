import { useCallback, useState } from "react"

import {
  DEFAULT_SETTINGS,
  type ReaderSettings,
  type ReaderTheme,
} from "@/components/reader/types"

/** 流式排版阅读器的主题、字体与版式等设置。 */
export function useReflowReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS)

  const updateSettings = useCallback(
    (patch: Partial<ReaderSettings>) =>
      setSettings((prev) => ({ ...prev, ...patch })),
    [],
  )

  const setTheme = useCallback(
    (theme: ReaderTheme) => updateSettings({ theme }),
    [updateSettings],
  )

  return { settings, updateSettings, setTheme }
}
