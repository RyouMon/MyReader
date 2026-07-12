import { useEffect, useState } from "react"
import {
  READING_CHROME_TOP_BAND_PX,
  readingChromeBottomBandPx,
} from "@/hooks/reader/useReadingChrome"
import { cn } from "@/lib/utils"

type ReadingChromeEdgeZonesProps = {
  /** 为 true 时条带不拦截指针（工具栏已显示，点击应落到正文/按钮）。 */
  passThrough: boolean
  expandBottomForTts?: boolean
  onReveal: () => void
}

/**
 * 盖在正文区域之上的顶/底窄带：用于在 iframe/画布吞掉父级 pointer 事件时仍能唤出工具栏。
 * 仅在指针进入条带或按下时唤出（不在条带内「划动即亮」）。
 */
export function ReadingChromeEdgeZones({
  passThrough,
  expandBottomForTts = false,
  onReveal,
}: ReadingChromeEdgeZonesProps) {
  const [coarsePointer, setCoarsePointer] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)")
    const sync = () => setCoarsePointer(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  const topPx = coarsePointer
    ? Math.round(READING_CHROME_TOP_BAND_PX * 1.35)
    : READING_CHROME_TOP_BAND_PX
  const bottomPx = coarsePointer
    ? Math.round(readingChromeBottomBandPx(expandBottomForTts) * 1.25)
    : readingChromeBottomBandPx(expandBottomForTts)

  const capture = passThrough ? "pointer-events-none" : "pointer-events-auto"

  return (
    <>
      <div
        aria-hidden
        className={cn("absolute inset-x-0 top-0 z-[41]", capture)}
        style={{ height: topPx }}
        onClick={onReveal}
        onMouseDown={onReveal}
        onMouseEnter={onReveal}
        onPointerDown={onReveal}
        onPointerEnter={onReveal}
      />
      <div
        aria-hidden
        className={cn("absolute inset-x-0 bottom-0 z-[41]", capture)}
        style={{ height: bottomPx }}
        onClick={onReveal}
        onMouseDown={onReveal}
        onMouseEnter={onReveal}
        onPointerDown={onReveal}
        onPointerEnter={onReveal}
      />
    </>
  )
}
