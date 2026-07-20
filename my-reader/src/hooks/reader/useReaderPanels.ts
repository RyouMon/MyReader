import { useCallback, useState } from "react"

/**
 * 阅读器目录、书签、高亮笔记、搜索及设置侧栏的开关状态；互斥打开，并提供统一关闭。
 */
export function useReaderPanels() {
  const [tocOpen, setTocOpen] = useState(false)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [annotationsOpen, setAnnotationsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const toggleToc = useCallback(() => {
    setTocOpen((prev) => {
      if (!prev) {
        setBookmarksOpen(false)
        setAnnotationsOpen(false)
        setSearchOpen(false)
        setSettingsOpen(false)
      }
      return !prev
    })
  }, [])

  const toggleBookmarks = useCallback(() => {
    setBookmarksOpen((prev) => {
      if (!prev) {
        setTocOpen(false)
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
        setBookmarksOpen(false)
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
        setBookmarksOpen(false)
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
        setBookmarksOpen(false)
        setAnnotationsOpen(false)
        setSearchOpen(false)
      }
      return !prev
    })
  }, [])

  const closePanels = useCallback(() => {
    setTocOpen(false)
    setBookmarksOpen(false)
    setAnnotationsOpen(false)
    setSearchOpen(false)
    setSettingsOpen(false)
  }, [])

  return {
    tocOpen,
    bookmarksOpen,
    annotationsOpen,
    searchOpen,
    settingsOpen,
    toggleToc,
    toggleBookmarks,
    toggleAnnotations,
    toggleSearch,
    toggleSettings,
    closePanels,
  }
}
