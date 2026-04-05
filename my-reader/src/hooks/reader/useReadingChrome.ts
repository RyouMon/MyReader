import { useCallback, useEffect, useRef, useState } from "react"

const TOP_BAND_PX = 56
const BOTTOM_BAR_PX = 72
const TTS_EXTRA_BOTTOM_PX = 176
const CHROME_HIDE_DELAY_MS = 200

/**
 * 阅读器根节点 ref + 顶底工具栏指针感应：指针在顶/底感应区内时显示工具栏，离开后延迟隐藏。
 * 朗读开启时可加大底部感应区，避免从底栏移到 TTS 条时误关。
 */
export function useReadingChrome(expandBottomForTts: boolean) {
  const readerRootRef = useRef<HTMLDivElement>(null)
  const [chromeVisible, setChromeVisible] = useState(false)
  const hideTimerRef = useRef<number | null>(null)

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    const scheduleDelayedHide = () => {
      if (hideTimerRef.current !== null) return
      hideTimerRef.current = window.setTimeout(() => {
        setChromeVisible(false)
        hideTimerRef.current = null
      }, CHROME_HIDE_DELAY_MS)
    }

    const onMove = (e: PointerEvent) => {
      const root = readerRootRef.current
      if (!root) return
      const r = root.getBoundingClientRect()
      const { clientX: x, clientY: y } = e
      const insideRoot =
        x >= r.left && x <= r.right && y >= r.top && y <= r.bottom

      if (!insideRoot) {
        scheduleDelayedHide()
        return
      }

      const relY = y - r.top
      const h = r.height
      const bottomBand =
        BOTTOM_BAR_PX + (expandBottomForTts ? TTS_EXTRA_BOTTOM_PX : 0)
      const inChromeZone = relY < TOP_BAND_PX || relY > h - bottomBand

      if (inChromeZone) {
        clearHideTimer()
        setChromeVisible(true)
      } else {
        scheduleDelayedHide()
      }
    }

    document.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      document.removeEventListener("pointermove", onMove)
      clearHideTimer()
    }
  }, [expandBottomForTts, clearHideTimer])

  const hideChrome = useCallback(() => {
    clearHideTimer()
    setChromeVisible(false)
  }, [clearHideTimer])

  const showChrome = useCallback(() => {
    clearHideTimer()
    setChromeVisible(true)
  }, [clearHideTimer])

  return {
    readerRootRef,
    chromeVisible,
    setChromeVisible,
    showChrome,
    hideChrome,
  }
}
