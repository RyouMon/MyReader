import { useCallback, useEffect, useRef, useState } from "react"

/** 顶栏唤出带高度（与 `ReadingChromeEdgeZones` 对齐）。 */
export const READING_CHROME_TOP_BAND_PX = 48
const BOTTOM_BAR_PX = 72
const TTS_EXTRA_BOTTOM_PX = 176
const CHROME_HIDE_DELAY_MS = 280

export function readingChromeBottomBandPx(expandBottomForTts: boolean): number {
  return BOTTOM_BAR_PX + (expandBottomForTts ? TTS_EXTRA_BOTTOM_PX : 0)
}

/**
 * 阅读器根节点 ref + 顶底工具栏指针感应：指针在顶/底感应区内时显示工具栏；离开顶/底带或顶栏后在正文区移动则延迟隐藏（见 `scheduleChromeHide`）。
 * 侧栏打开时保持顶栏可见，避免在目录/设置内移动被误判为「非边缘」而收起。
 * 朗读开启时可加大底部感应区，避免从底栏移到 TTS 条时误关。
 */
export function useReadingChrome(
  expandBottomForTts: boolean,
  /** 目录或设置展开时为 true，暂停按正文区逻辑自动隐藏顶栏。 */
  sidePanelsOpen = false,
) {
  const readerRootRef = useRef<HTMLDivElement>(null)
  const [chromeVisible, setChromeVisible] = useState(false)
  const hideTimerRef = useRef<number | null>(null)

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  /** 正文区移动或离开顶栏后：延迟收起，避免手抖立刻关掉。 */
  const scheduleChromeHide = useCallback(() => {
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      setChromeVisible(false)
      hideTimerRef.current = null
    }, CHROME_HIDE_DELAY_MS)
  }, [clearHideTimer])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const root = readerRootRef.current
      if (!root) return
      const r = root.getBoundingClientRect()
      const { clientX: x, clientY: y } = e
      const insideRoot =
        x >= r.left && x <= r.right && y >= r.top && y <= r.bottom

      if (!insideRoot) {
        scheduleChromeHide()
        return
      }

      if (sidePanelsOpen) {
        clearHideTimer()
        setChromeVisible(true)
        return
      }

      const relY = y - r.top
      const h = r.height
      const bottomBand = readingChromeBottomBandPx(expandBottomForTts)
      const inChromeZone =
        relY < READING_CHROME_TOP_BAND_PX || relY > h - bottomBand

      if (inChromeZone) {
        clearHideTimer()
        setChromeVisible(true)
      } else {
        scheduleChromeHide()
      }
    }

    /** capture：尽量在事件落到 iframe 前收到，否则从顶栏移入正文时父窗口可能收不到 move，顶栏会一直亮。 */
    document.addEventListener("pointermove", onMove, { passive: true, capture: true })
    return () => {
      document.removeEventListener("pointermove", onMove, { capture: true })
      clearHideTimer()
    }
  }, [expandBottomForTts, sidePanelsOpen, clearHideTimer, scheduleChromeHide])

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
    scheduleChromeHide,
  }
}
