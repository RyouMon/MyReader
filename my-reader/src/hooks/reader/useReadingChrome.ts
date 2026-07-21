import { useCallback, useEffect, useRef, useState } from "react"

/** Height of the top reveal zone, kept in sync with `ReadingChromeEdgeZones`. */
export const READING_CHROME_TOP_BAND_PX = 48
const BOTTOM_BAR_PX = 72
const TTS_EXTRA_BOTTOM_PX = 176
const CHROME_HIDE_DELAY_MS = 280

export function readingChromeBottomBandPx(expandBottomForTts: boolean): number {
  return BOTTOM_BAR_PX + (expandBottomForTts ? TTS_EXTRA_BOTTOM_PX : 0)
}

/**
 * Manages the reader root ref and pointer-aware top and bottom chrome.
 * Entering either edge zone reveals the chrome. Moving through the content or
 * leaving the reader schedules it to hide after a short delay.
 * While a side panel is open, the chrome remains visible and pending hide
 * timers are cleared.
 */
export function useReadingChrome(
  expandBottomForTts: boolean,
  /** Whether any reader side panel is open, suspending automatic chrome hiding. */
  sidePanelsOpen = false,
) {
  const readerRootRef = useRef<HTMLDivElement>(null)
  const [autoChromeVisible, setChromeVisible] = useState(false)
  const hideTimerRef = useRef<number | null>(null)
  const chromeVisible = sidePanelsOpen || autoChromeVisible

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  /** Hides after a short delay to avoid abrupt dismissal during pointer movement. */
  const scheduleChromeHide = useCallback(() => {
    if (sidePanelsOpen) {
      clearHideTimer()
      return
    }
    if (hideTimerRef.current !== null) return
    hideTimerRef.current = window.setTimeout(() => {
      setChromeVisible(false)
      hideTimerRef.current = null
    }, CHROME_HIDE_DELAY_MS)
  }, [clearHideTimer, sidePanelsOpen])

  useEffect(() => {
    if (!sidePanelsOpen) return
    clearHideTimer()
  }, [clearHideTimer, sidePanelsOpen])

  const handlePointerPosition = useCallback(
    (clientX: number, clientY: number) => {
      const root = readerRootRef.current
      if (!root) return
      const r = root.getBoundingClientRect()
      const insideRoot =
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom

      if (!insideRoot) {
        scheduleChromeHide()
        return
      }

      if (sidePanelsOpen) {
        clearHideTimer()
        setChromeVisible(true)
        return
      }

      const relY = clientY - r.top
      const bottomBand = readingChromeBottomBandPx(expandBottomForTts)
      const inChromeZone =
        relY < READING_CHROME_TOP_BAND_PX || relY > r.height - bottomBand

      if (inChromeZone) {
        clearHideTimer()
        setChromeVisible(true)
      } else {
        scheduleChromeHide()
      }
    },
    [clearHideTimer, expandBottomForTts, scheduleChromeHide, sidePanelsOpen],
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      handlePointerPosition(e.clientX, e.clientY)
    }

    /** Handles the host document; `useReaderIframePointerBridge` forwards Readium iframe events here. */
    document.addEventListener("pointermove", onMove, {
      passive: true,
      capture: true,
    })
    return () => {
      document.removeEventListener("pointermove", onMove, { capture: true })
      clearHideTimer()
    }
  }, [clearHideTimer, handlePointerPosition])

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
    handlePointerPosition,
  }
}
