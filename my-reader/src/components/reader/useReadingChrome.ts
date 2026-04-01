import { useCallback, useEffect, useRef, useState } from "react"

const TOP_BAND_PX = 56
const BOTTOM_BAR_PX = 72
const TTS_EXTRA_BOTTOM_PX = 176
/** 离开工具栏感应区后延迟再隐藏，便于现有 CSS transition 做渐变收起 */
const CHROME_HIDE_DELAY_MS = 200

/**
 * 工具栏显隐：指针在顶/底工具栏区域内时显示；离开该区域后延迟再隐藏（渐变由顶栏/底栏 transition 负责）。
 */
export function useReadingChrome(opts: {
  rootRef: React.RefObject<HTMLElement | null>
  /** 朗读开启时加大底部感应区，便于从底栏移到 TTS 条时不误关 */
  expandBottomForTts?: boolean
}) {
  const { rootRef, expandBottomForTts } = opts
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
      const root = rootRef.current
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
  }, [rootRef, expandBottomForTts, clearHideTimer])

  const hideChrome = useCallback(() => {
    clearHideTimer()
    setChromeVisible(false)
  }, [clearHideTimer])

  const showChrome = useCallback(() => {
    clearHideTimer()
    setChromeVisible(true)
  }, [clearHideTimer])

  return {
    chromeVisible,
    setChromeVisible,
    showChrome,
    hideChrome,
  }
}
