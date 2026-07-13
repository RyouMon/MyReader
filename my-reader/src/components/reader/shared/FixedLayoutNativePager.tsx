import {
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react"
import { flushSync } from "react-dom"
import {
  type FixedLayoutSpread,
  logicalToVisualSpreadIndex,
  nearestVisualSpreadIndex,
  visualToLogicalSpreadIndex,
} from "@/lib/readium/fixedLayoutPagination"

export type FixedLayoutNativePagerProps = {
  scrollerRef: MutableRefObject<HTMLDivElement | null>
  spreads: readonly FixedLayoutSpread[]
  currentSpreadIndex: number
  direction: "ltr" | "rtl"
  zoomed: boolean
  onSpreadIndexChange: (index: number) => void
  renderSpread: (
    spread: FixedLayoutSpread,
    logicalIndex: number,
    active: boolean,
  ) => ReactNode
}

export function FixedLayoutNativePager({
  scrollerRef,
  spreads,
  currentSpreadIndex,
  direction,
  zoomed,
  onSpreadIndexChange,
  renderSpread,
}: FixedLayoutNativePagerProps) {
  const onSpreadIndexChangeRef = useRef(onSpreadIndexChange)
  const directionRef = useRef(direction)
  const spreadCountRef = useRef(spreads.length)
  const currentSpreadIndexRef = useRef(currentSpreadIndex)
  const zoomedRef = useRef(zoomed)
  const pendingVisualIndexRef = useRef<number | null>(null)
  const previousLayoutRef = useRef<{
    direction: "ltr" | "rtl"
    spreadCount: number
    currentSpreadIndex: number
  } | null>(null)

  onSpreadIndexChangeRef.current = onSpreadIndexChange
  directionRef.current = direction
  spreadCountRef.current = spreads.length
  currentSpreadIndexRef.current = currentSpreadIndex
  zoomedRef.current = zoomed

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || spreads.length === 0 || scroller.clientWidth <= 0) return

    const visualIndex = logicalToVisualSpreadIndex(
      currentSpreadIndex,
      spreads.length,
      direction,
    )
    const target = visualIndex * scroller.clientWidth
    const previous = previousLayoutRef.current
    const sameLayout =
      previous?.direction === direction &&
      previous.spreadCount === spreads.length
    const adjacent =
      previous !== null &&
      Math.abs(previous.currentSpreadIndex - currentSpreadIndex) === 1
    previousLayoutRef.current = {
      direction,
      spreadCount: spreads.length,
      currentSpreadIndex,
    }

    if (Math.abs(scroller.scrollLeft - target) < 1) return
    const behavior = sameLayout && adjacent ? "smooth" : "auto"
    pendingVisualIndexRef.current = behavior === "smooth" ? visualIndex : null
    scroller.scrollTo({
      left: target,
      behavior,
    })
  }, [currentSpreadIndex, direction, scrollerRef, spreads.length])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    let fallbackTimer: number | undefined
    const commitPosition = () => {
      if (zoomedRef.current) return
      const spreadCount = spreadCountRef.current
      const visualIndex = nearestVisualSpreadIndex(
        scroller.scrollLeft,
        scroller.clientWidth,
        spreadCount,
      )
      const pendingVisualIndex = pendingVisualIndexRef.current
      if (pendingVisualIndex !== null) {
        if (visualIndex !== pendingVisualIndex) return
        pendingVisualIndexRef.current = null
      }
      const logicalIndex = visualToLogicalSpreadIndex(
        visualIndex,
        spreadCount,
        directionRef.current,
      )
      if (logicalIndex === currentSpreadIndexRef.current) return
      flushSync(() => {
        onSpreadIndexChangeRef.current(logicalIndex)
      })
    }
    const onScroll = () => {
      window.clearTimeout(fallbackTimer)
      fallbackTimer = window.setTimeout(commitPosition, 120)
    }

    const scrollEndSupported: boolean = "onscrollend" in scroller
    if (scrollEndSupported) {
      scroller.addEventListener("scrollend", commitPosition)
    } else {
      scroller.addEventListener("scroll", onScroll, { passive: true })
    }

    const observer = new ResizeObserver(() => {
      pendingVisualIndexRef.current = null
      const visualIndex = logicalToVisualSpreadIndex(
        previousLayoutRef.current?.currentSpreadIndex ?? 0,
        spreadCountRef.current,
        directionRef.current,
      )
      scroller.scrollTo({
        left: visualIndex * scroller.clientWidth,
        behavior: "auto",
      })
    })
    observer.observe(scroller)

    return () => {
      window.clearTimeout(fallbackTimer)
      observer.disconnect()
      scroller.removeEventListener("scrollend", commitPosition)
      scroller.removeEventListener("scroll", onScroll)
    }
  }, [scrollerRef])

  return (
    <div
      ref={scrollerRef}
      className="fixed-layout-native-pager flex h-full w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        overflowX: zoomed ? "hidden" : "auto",
        overflowY: "hidden",
        overscrollBehaviorX: "contain",
        scrollSnapType: zoomed ? "none" : "x mandatory",
      }}
    >
      {Array.from({ length: spreads.length }, (_, visualIndex) => {
        const logicalIndex = visualToLogicalSpreadIndex(
          visualIndex,
          spreads.length,
          direction,
        )
        const active = logicalIndex === currentSpreadIndex
        const shouldRender = Math.abs(logicalIndex - currentSpreadIndex) <= 1
        return (
          <div
            key={`${direction}-${logicalIndex}`}
            data-fixed-layout-spread={logicalIndex}
            className="flex h-full w-full min-w-full max-w-full flex-none basis-full items-center justify-center overflow-hidden"
            style={{
              scrollSnapAlign: "center",
              scrollSnapStop: "always",
            }}
            aria-hidden={active ? undefined : true}
          >
            {shouldRender
              ? renderSpread(spreads[logicalIndex], logicalIndex, active)
              : null}
          </div>
        )
      })}
    </div>
  )
}
