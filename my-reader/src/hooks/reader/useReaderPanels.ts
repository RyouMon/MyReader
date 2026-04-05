import { useCallback, useState } from "react"

/**
 * 阅读器目录与设置侧栏的开关状态；互斥打开，并提供统一关闭。
 */
export function useReaderPanels() {
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const toggleToc = useCallback(() => {
    setTocOpen((prev) => {
      if (!prev) setSettingsOpen(false)
      return !prev
    })
  }, [])

  const toggleSettings = useCallback(() => {
    setSettingsOpen((prev) => {
      if (!prev) setTocOpen(false)
      return !prev
    })
  }, [])

  const closePanels = useCallback(() => {
    setTocOpen(false)
    setSettingsOpen(false)
  }, [])

  return {
    tocOpen,
    settingsOpen,
    toggleToc,
    toggleSettings,
    closePanels,
  }
}
