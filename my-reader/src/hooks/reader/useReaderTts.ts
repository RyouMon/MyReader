import { useCallback, useEffect, useRef, useState } from "react"

/**
 * 朗读面板状态：播放进度、速度与配置；含自动翻句定时器。
 */
export function useReaderTts() {
  const [ttsActive, setTtsActive] = useState(false)
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [ttsCurrent, setTtsCurrent] = useState(-1)
  const [ttsSpeed, setTtsSpeed] = useState(1.0)
  const [ttsConfigId, setTtsConfigId] = useState("default")

  const ttsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopAutoAdvance = useCallback(() => {
    if (ttsIntervalRef.current) {
      clearInterval(ttsIntervalRef.current)
      ttsIntervalRef.current = null
    }
  }, [])

  useEffect(() => stopAutoAdvance, [stopAutoAdvance])

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
  }
}
