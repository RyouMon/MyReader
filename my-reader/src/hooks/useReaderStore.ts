import { useCallback, useEffect, useRef, useState } from "react"

import {
  DEFAULT_SETTINGS,
  type ReaderSettings,
  type ReaderTheme,
} from "@/components/reader/types"

export function useReaderStore() {
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS)

  const [ttsActive, setTtsActive] = useState(false)
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [ttsCurrent, setTtsCurrent] = useState(-1)
  const [ttsSpeed, setTtsSpeed] = useState(1.0)
  const [ttsConfigId, setTtsConfigId] = useState("default")

  const [progress, setProgress] = useState(0)
  const [currentChapter, setCurrentChapter] = useState(0)

  const ttsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopAutoAdvance = useCallback(() => {
    if (ttsIntervalRef.current) {
      clearInterval(ttsIntervalRef.current)
      ttsIntervalRef.current = null
    }
  }, [])

  useEffect(() => stopAutoAdvance, [stopAutoAdvance])

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

  const toggleBookmark = useCallback(() => setBookmarked((prev) => !prev), [])

  const updateSettings = useCallback(
    (patch: Partial<ReaderSettings>) =>
      setSettings((prev) => ({ ...prev, ...patch })),
    [],
  )

  const setTheme = useCallback(
    (theme: ReaderTheme) => updateSettings({ theme }),
    [updateSettings],
  )

  const startAutoAdvance = useCallback(
    (total: number) => {
      stopAutoAdvance()
      ttsIntervalRef.current = setInterval(() => {
        setTtsCurrent((prev) => {
          if (prev < total - 1) return prev + 1
          setTtsPlaying(false)
          stopAutoAdvance()
          return prev
        })
      }, 3000)
    },
    [stopAutoAdvance],
  )

  const toggleTts = useCallback(() => {
    setTtsActive((prev) => {
      if (prev) {
        setTtsPlaying(false)
        setTtsCurrent(-1)
        stopAutoAdvance()
      }
      return !prev
    })
  }, [stopAutoAdvance])

  const ttsTogglePlay = useCallback(
    (total: number) => {
      setTtsPlaying((prev) => {
        if (prev) {
          stopAutoAdvance()
          return false
        }
        setTtsCurrent((c) => (c < 0 ? 0 : c))
        startAutoAdvance(total)
        return true
      })
    },
    [startAutoAdvance, stopAutoAdvance],
  )

  const ttsNext = useCallback((total: number) => {
    setTtsCurrent((prev) => Math.min(prev + 1, total - 1))
  }, [])

  const ttsPrev = useCallback(() => {
    setTtsCurrent((prev) => Math.max(prev - 1, 0))
  }, [])

  const ttsJumpTo = useCallback(
    (idx: number, total: number) => {
      setTtsCurrent(idx)
      setTtsPlaying(true)
      startAutoAdvance(total)
    },
    [startAutoAdvance],
  )

  return {
    tocOpen,
    toggleToc,
    settingsOpen,
    toggleSettings,
    closePanels,

    bookmarked,
    toggleBookmark,

    settings,
    updateSettings,
    setTheme,

    ttsActive,
    toggleTts,
    ttsPlaying,
    ttsTogglePlay,
    ttsCurrent,
    ttsNext,
    ttsPrev,
    ttsJumpTo,
    ttsSpeed,
    setTtsSpeed,
    ttsConfigId,
    setTtsConfigId,

    progress,
    setProgress,
    currentChapter,
    setCurrentChapter,
  }
}
