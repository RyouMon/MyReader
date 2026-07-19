import { useCallback, useState } from "react"

/**
 * 阅读器目录、高亮与笔记、搜索及设置侧栏的开关状态；互斥打开，并提供统一关闭。
 */
export function useReaderPanels() {
  const [tocOpen, setTocOpen] = useState(false)
  const [annotationsOpen, setAnnotationsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const toggleToc = useCallback(() => {
    setTocOpen((prev) => {
      if (!prev) {
        setAnnotationsOpen(false)
        setSearchOpen(false)
        setSettingsOpen(false)
      }
      return !prev
    })
  }, [])

  const toggleAnnotations = useCallback(() => {
    setAnnotationsOpen((prev) => {
      if (!prev) {
        setTocOpen(false)
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
        setAnnotationsOpen(false)
        setSettingsOpen(false)
      }
      return !prev
    })
  }, [])

  const toggleSettings = useCallback(() => {
    setSettingsOpen((prev) => {
      if (!prev) {
        setTocOpen(false)
        setAnnotationsOpen(false)
        setSearchOpen(false)
      }
      return !prev
    })
  }, [])

  const closePanels = useCallback(() => {
    setTocOpen(false)
    setAnnotationsOpen(false)
    setSearchOpen(false)
    setSettingsOpen(false)
  }, [])

  return {
    tocOpen,
    annotationsOpen,
    searchOpen,
    settingsOpen,
    toggleToc,
    toggleAnnotations,
    toggleSearch,
    toggleSettings,
    closePanels,
  }
}
