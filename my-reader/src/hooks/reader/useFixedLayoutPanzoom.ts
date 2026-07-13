import Panzoom, {
  type PanzoomEventDetail,
  type PanzoomObject,
} from "@panzoom/panzoom"
import { type MutableRefObject, useLayoutEffect, useRef, useState } from "react"

export type UseFixedLayoutPanzoomOptions = {
  scrollerRef: MutableRefObject<HTMLDivElement | null>
  targetKey: string
  maxScale: number
  onUnzoomedWheel: (event: WheelEvent) => boolean
  onZoomSettled?: (scale: number) => void
}

export function useFixedLayoutPanzoom({
  scrollerRef,
  targetKey,
  maxScale,
  onUnzoomedWheel,
  onZoomSettled,
}: UseFixedLayoutPanzoomOptions) {
  const panzoomRef = useRef<PanzoomObject | null>(null)
  const scaleRef = useRef(1)
  const zoomedRef = useRef(false)
  const onUnzoomedWheelRef = useRef(onUnzoomedWheel)
  const onZoomSettledRef = useRef(onZoomSettled)
  const [zoomed, setZoomed] = useState(false)

  onUnzoomedWheelRef.current = onUnzoomedWheel
  onZoomSettledRef.current = onZoomSettled

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const target = scroller?.querySelector<HTMLDivElement>(
      '[data-fixed-layout-spread]:not([aria-hidden="true"]) > [data-fixed-layout-panzoom-target]',
    )
    if (!scroller || !target?.isConnected) return
    target.style.removeProperty("transform")
    target.style.removeProperty("transition")
    target.dataset.panzoomKey = targetKey

    let zoomTimer: number | undefined
    let instance: PanzoomObject | null = null
    instance = Panzoom(target, {
      minScale: 1,
      maxScale,
      step: 0.12,
      contain: "outside",
      panOnlyWhenZoomed: true,
      touchAction: "pan-x",
      cursor: "",
      handleStartEvent: (event) => {
        if ((instance?.getScale() ?? 1) > 1) event.preventDefault()
      },
    })
    panzoomRef.current = instance
    scaleRef.current = 1
    zoomedRef.current = false
    setZoomed(false)

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<PanzoomEventDetail>).detail
      scaleRef.current = detail.scale
      const nextZoomed = detail.scale > 1.001
      if (nextZoomed !== zoomedRef.current) {
        zoomedRef.current = nextZoomed
        setZoomed(nextZoomed)
        instance?.setOptions({
          cursor: nextZoomed ? "grab" : "",
          touchAction: nextZoomed ? "none" : "pan-x",
        })
      }
    }
    const onZoom = () => {
      window.clearTimeout(zoomTimer)
      zoomTimer = window.setTimeout(() => {
        onZoomSettledRef.current?.(scaleRef.current)
      }, 120)
    }
    const onWheel = (event: WheelEvent) => {
      const activePanzoom = panzoomRef.current
      if (!activePanzoom) return

      const targetSlot = target.closest<HTMLElement>(
        "[data-fixed-layout-spread]",
      )
      const targetVisualIndex = targetSlot
        ? Array.from(scroller.children).indexOf(targetSlot)
        : -1
      const visibleVisualIndex = Math.round(
        scroller.scrollLeft / Math.max(1, scroller.clientWidth),
      )
      const targetIsVisible = targetVisualIndex === visibleVisualIndex

      if (event.ctrlKey || event.metaKey) {
        if (!targetIsVisible) {
          event.preventDefault()
          return
        }
        const next = activePanzoom.zoomWithWheel(event)
        if (next.scale <= 1.001) {
          activePanzoom.reset({ animate: false })
        }
        return
      }

      if (scaleRef.current > 1.001) {
        event.preventDefault()
        if (!targetIsVisible) return
        const linePixels =
          event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 40 : 1
        const pageX =
          event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? scroller.clientWidth
            : 1
        const pageY =
          event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? scroller.clientHeight
            : 1
        activePanzoom.pan(
          (-event.deltaX * linePixels * pageX) / scaleRef.current,
          (-event.deltaY * linePixels * pageY) / scaleRef.current,
          { relative: true, animate: false },
        )
        return
      }

      if (onUnzoomedWheelRef.current(event)) event.preventDefault()
    }

    target.addEventListener("panzoomchange", onChange)
    target.addEventListener("panzoomzoom", onZoom)
    scroller.addEventListener("wheel", onWheel, { passive: false })

    return () => {
      window.clearTimeout(zoomTimer)
      target.removeEventListener("panzoomchange", onChange)
      target.removeEventListener("panzoomzoom", onZoom)
      scroller.removeEventListener("wheel", onWheel)
      instance?.resetStyle()
      instance?.destroy()
      target.style.removeProperty("transform")
      target.style.removeProperty("transition")
      delete target.dataset.panzoomKey
      if (panzoomRef.current === instance) panzoomRef.current = null
      scaleRef.current = 1
      zoomedRef.current = false
    }
  }, [maxScale, scrollerRef, targetKey])

  return { zoomed }
}
