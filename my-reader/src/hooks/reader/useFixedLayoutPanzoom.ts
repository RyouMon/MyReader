import Panzoom, {
  type PanzoomEventDetail,
  type PanzoomObject,
} from "@panzoom/panzoom"
import { type MutableRefObject, useLayoutEffect, useRef, useState } from "react"
import {
  consumeDoubleClickPointerTap,
  createDoubleClickGestureState,
  nextDoubleClickZoomScale,
  type PointerPosition,
} from "@/lib/readium/fixedLayoutGestures"

const DOUBLE_CLICK_ZOOM_DURATION_MS = 200

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
    let pointerDown: (PointerPosition & { pointerId: number }) | null = null
    let doubleClickScale: number | null = null
    let doubleClickAnimation: Animation | null = null
    const doubleClickState = createDoubleClickGestureState()
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
      if (
        doubleClickScale !== null &&
        Math.abs(detail.scale - doubleClickScale) > 0.001
      ) {
        doubleClickScale = null
      }
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
    const isTargetVisible = () => {
      const targetSlot = target.closest<HTMLElement>(
        "[data-fixed-layout-spread]",
      )
      const targetVisualIndex = targetSlot
        ? Array.from(scroller.children).indexOf(targetSlot)
        : -1
      const visibleVisualIndex = Math.round(
        scroller.scrollLeft / Math.max(1, scroller.clientWidth),
      )
      return targetVisualIndex === visibleVisualIndex
    }
    const applyDoubleClickZoom = (event: PointerEvent) => {
      const activePanzoom = panzoomRef.current
      if (!activePanzoom || !isTargetVisible()) return

      const continuesDoubleClickCycle =
        doubleClickScale !== null &&
        Math.abs(scaleRef.current - doubleClickScale) <= 0.001
      const nextScale = nextDoubleClickZoomScale(
        scaleRef.current,
        maxScale,
        continuesDoubleClickCycle,
      )
      doubleClickScale = nextScale > 1.001 ? nextScale : null
      const fromTransform = getComputedStyle(target).transform
      doubleClickAnimation?.cancel()
      const next =
        nextScale === 1
          ? activePanzoom.reset({ animate: false })
          : activePanzoom.zoomToPoint(nextScale, event, { animate: false })
      doubleClickAnimation = target.animate(
        [
          { transform: fromTransform },
          {
            transform: `scale(${next.scale}) translate(${next.x}px, ${next.y}px)`,
          },
        ],
        {
          duration: DOUBLE_CLICK_ZOOM_DURATION_MS,
          easing: "ease-in-out",
        },
      )
    }
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        event.pointerType !== "mouse" ||
        !event.isPrimary
      ) {
        pointerDown = null
        doubleClickState.lastTap = null
        return
      }
      pointerDown = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp,
      }
    }
    const onPointerUp = (event: PointerEvent) => {
      const start = pointerDown
      pointerDown = null
      if (
        !start ||
        start.pointerId !== event.pointerId ||
        event.button !== 0 ||
        event.pointerType !== "mouse" ||
        !event.isPrimary
      ) {
        doubleClickState.lastTap = null
        return
      }
      if (!consumeDoubleClickPointerTap(doubleClickState, start, event)) return

      event.preventDefault()
      applyDoubleClickZoom(event)
    }
    const onPointerCancel = () => {
      pointerDown = null
      doubleClickState.lastTap = null
    }
    const onDoubleClick = (event: MouseEvent) => {
      event.preventDefault()
    }
    const onWheel = (event: WheelEvent) => {
      const activePanzoom = panzoomRef.current
      if (!activePanzoom) return

      if (event.ctrlKey || event.metaKey) {
        if (!isTargetVisible()) {
          event.preventDefault()
          return
        }
        doubleClickScale = null
        const next = activePanzoom.zoomWithWheel(event)
        if (next.scale <= 1.001) {
          activePanzoom.reset({ animate: false })
        }
        return
      }

      if (scaleRef.current > 1.001) {
        event.preventDefault()
        if (!isTargetVisible()) return
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
    target.addEventListener("panzoomreset", onZoom)
    target.addEventListener("panzoomzoom", onZoom)
    target.addEventListener("pointerdown", onPointerDown)
    target.addEventListener("pointerup", onPointerUp)
    target.addEventListener("pointercancel", onPointerCancel)
    target.addEventListener("dblclick", onDoubleClick)
    scroller.addEventListener("wheel", onWheel, { passive: false })

    return () => {
      window.clearTimeout(zoomTimer)
      doubleClickAnimation?.cancel()
      target.removeEventListener("panzoomchange", onChange)
      target.removeEventListener("panzoomreset", onZoom)
      target.removeEventListener("panzoomzoom", onZoom)
      target.removeEventListener("pointerdown", onPointerDown)
      target.removeEventListener("pointerup", onPointerUp)
      target.removeEventListener("pointercancel", onPointerCancel)
      target.removeEventListener("dblclick", onDoubleClick)
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
