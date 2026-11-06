import { type RefObject, useCallback, useEffect, useRef } from "react"
import {
  consumeWheelPageTurn,
  createWheelPageTurnState,
} from "@/lib/readium/fixedLayoutGestures"

export function useReaderWheelPageTurn(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  onPrevious: () => void,
  onNext: () => void,
): (event: WheelEvent) => void {
  const gestureRef = useRef(createWheelPageTurnState())

  useEffect(() => {
    gestureRef.current = createWheelPageTurnState()
  }, [enabled])

  return useCallback(
    (event: WheelEvent) => {
      if (
        !enabled ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.deltaY === 0 ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
      )
        return

      const target = event.target as Element | null
      if (target?.closest?.("input, textarea, select, [contenteditable]"))
        return

      event.preventDefault()
      const turn = consumeWheelPageTurn(
        gestureRef.current,
        {
          clientX: event.clientX,
          clientY: event.clientY,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          deltaMode: event.deltaMode,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ,
          // Iframes have different time origins, but share this gesture state.
          timeStamp: performance.now(),
        },
        {
          width: containerRef.current?.clientWidth ?? 1,
          height: containerRef.current?.clientHeight ?? 1,
        },
      )
      if (!turn) return
      if (turn.direction > 0) onNext()
      else onPrevious()
    },
    [containerRef, enabled, onNext, onPrevious],
  )
}
