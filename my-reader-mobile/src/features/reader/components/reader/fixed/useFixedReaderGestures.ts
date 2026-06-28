import { useCallback, useMemo, useRef } from "react"
import { PanResponder, type GestureResponderEvent } from "react-native"

const TAP_MAX_DRIFT = 12
const TAP_MAX_DURATION_MS = 260
const MIN_ZOOM = 1
const MAX_ZOOM = 3
const EDGE_TAP_MAX_ZOOM = 1.02

export type FixedReaderNavigationMode = "horizontal" | "vertical"

export type UseFixedReaderGesturesOptions = {
  pinchZoomEnabled: boolean
  zoomScale: number
  onZoomScaleChange?: (scale: number) => void
  navigationMode: FixedReaderNavigationMode
  screenWidth: number
  currentPage: number
  totalPages: number
  goToPage: (index: number) => void
  onToggleChrome?: () => void
}

type TouchSnapshot = {
  x: number
  y: number
  timestampMs: number
}

function pinchDistance(evt: GestureResponderEvent): number | null {
  const { touches } = evt.nativeEvent
  if (touches.length < 2) return null
  const a = touches[0]!
  const b = touches[1]!
  const dx = a.pageX - b.pageX
  const dy = a.pageY - b.pageY
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * 固定版式阅读器手势：双指缩放走 PanResponder + 捕获阶段（见 RN Gesture Responder System），
 * 单指滑动/点按仍在子级 FlatList 的 Touch 回调中处理，避免 PanResponder 抢占单指导致无法横向翻页。
 */
export function useFixedReaderGestures(options: UseFixedReaderGesturesOptions) {
  const optsRef = useRef(options)
  optsRef.current = options

  const readerTouchStartRef = useRef<TouchSnapshot | null>(null)
  const pinchStartDistanceRef = useRef<number | null>(null)
  const pinchStartScaleRef = useRef(1)
  const onToggleChromeRef = useRef(options.onToggleChrome)
  onToggleChromeRef.current = options.onToggleChrome

  const pinchPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (evt) => {
          const { pinchZoomEnabled } = optsRef.current
          return pinchZoomEnabled && evt.nativeEvent.touches.length >= 2
        },
        onMoveShouldSetPanResponderCapture: (evt) => {
          const { pinchZoomEnabled } = optsRef.current
          return pinchZoomEnabled && evt.nativeEvent.touches.length >= 2
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderGrant: (evt) => {
          const d = pinchDistance(evt)
          if (d != null) {
            pinchStartDistanceRef.current = d
            pinchStartScaleRef.current = optsRef.current.zoomScale
          }
        },
        onPanResponderMove: (evt) => {
          if (evt.nativeEvent.touches.length < 2) {
            pinchStartDistanceRef.current = null
            return
          }
          if (pinchStartDistanceRef.current == null) return
          const d = pinchDistance(evt)
          if (d == null) return
          const ratio = d / pinchStartDistanceRef.current
          const next = Math.max(
            MIN_ZOOM,
            Math.min(MAX_ZOOM, pinchStartScaleRef.current * ratio),
          )
          optsRef.current.onZoomScaleChange?.(Number(next.toFixed(2)))
        },
        onPanResponderRelease: () => {
          pinchStartDistanceRef.current = null
        },
        onPanResponderTerminate: () => {
          pinchStartDistanceRef.current = null
        },
      }),
    [],
  )

  const handleListTouchStart = useCallback((event: GestureResponderEvent) => {
    if (event.nativeEvent.touches.length !== 1) {
      readerTouchStartRef.current = null
      return
    }
    const touch = event.nativeEvent.touches[0]!
    readerTouchStartRef.current = {
      x: touch.pageX,
      y: touch.pageY,
      timestampMs: Date.now(),
    }
  }, [])

  const handleListTouchEnd = useCallback((event: GestureResponderEvent) => {
    const start = readerTouchStartRef.current
    readerTouchStartRef.current = null
    if (!start) return

    const changedTouches = event.nativeEvent.changedTouches
    const currentTouch = changedTouches.length > 0 ? changedTouches[0] : null
    if (!currentTouch) return

    const dx = currentTouch.pageX - start.x
    const dy = currentTouch.pageY - start.y
    const durationMs = Date.now() - start.timestampMs
    const isTapGesture =
      Math.abs(dx) <= TAP_MAX_DRIFT &&
      Math.abs(dy) <= TAP_MAX_DRIFT &&
      durationMs <= TAP_MAX_DURATION_MS
    if (!isTapGesture) return

    const o = optsRef.current
    const {
      zoomScale,
      navigationMode,
      screenWidth,
      currentPage,
      totalPages,
      goToPage,
    } = o

    if (navigationMode === "horizontal" && zoomScale <= EDGE_TAP_MAX_ZOOM) {
      const tapSideWidth = Math.max(48, screenWidth * 0.28)
      if (start.x <= tapSideWidth) {
        if (currentPage > 0) goToPage(currentPage - 1)
        return
      }
      if (start.x >= screenWidth - tapSideWidth) {
        if (currentPage < totalPages - 1) goToPage(currentPage + 1)
        return
      }
    }

    onToggleChromeRef.current?.()
  }, [])

  const handleListTouchCancel = useCallback(() => {
    readerTouchStartRef.current = null
  }, [])

  return {
    pinchPanHandlers: pinchPanResponder.panHandlers,
    listTouchHandlers: {
      onTouchStart: handleListTouchStart,
      onTouchEnd: handleListTouchEnd,
      onTouchCancel: handleListTouchCancel,
    },
  }
}
