import { useCallback, useEffect, useRef, useState } from "react"

import { useAppUiStore } from "@/stores/appUiStore"

/**
 * 朗读面板状态：播放进度、速度与配置；含自动翻句定时器。
 * 持久化的 TTS 配置（预设与语速）来自全局 store。
 */
export function useReaderTts() {
  const ttsConfigId = useAppUiStore((s) => s.reflowable.tts.ttsConfigId)
  const ttsSpeed = useAppUiStore((s) => s.reflowable.tts.ttsSpeed)
  const patchReflowableTts = useAppUiStore((s) => s.patchReflowableTts)

  const [ttsActive, setTtsActive] = useState(false)
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [ttsCurrent, setTtsCurrent] = useState(-1)

  const setTtsConfigId = useCallback(
    (id: string) => patchReflowableTts({ ttsConfigId: id }),
    [patchReflowableTts],
  )

  const setTtsSpeed = useCallback(
    (speed: number) => patchReflowableTts({ ttsSpeed: speed }),
    [patchReflowableTts],
  )

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
