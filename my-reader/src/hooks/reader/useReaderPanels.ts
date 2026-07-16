import { useCallback, useState } from "react"

/**
 * 阅读器目录、搜索与设置侧栏的开关状态；互斥打开，并提供统一关闭。
 */
export function useReaderPanels() {
  const [tocOpen, setTocOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const toggleToc = useCallback(() => {
    setTocOpen((prev) => {
      if (!prev) {
        setSearchOpen(false)
        setSettingsOpen(false)
      }
      return !prev
    })
  }, [])

  const toggleSearch = useCallback(() => {
    setSearchOpen((prev) => {
      if (!prev) {
        setTocOpen(false)
        setSettingsOpen(false)
      }
      return !prev
    })
  }, [])

  const toggleSettings = useCallback(() => {
    setSettingsOpen((prev) => {
      if (!prev) {
        setTocOpen(false)
        setSearchOpen(false)
      }
      return !prev
    })
  }, [])

  const closePanels = useCallback(() => {
    setTocOpen(false)
    setSearchOpen(false)
    setSettingsOpen(false)
  }, [])

  return {
    tocOpen,
    searchOpen,
    settingsOpen,
    toggleToc,
    toggleSearch,
    toggleSettings,
    closePanels,
  }
}
