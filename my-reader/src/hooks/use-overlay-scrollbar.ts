import type { PartialOptions } from "overlayscrollbars"
import { useOverlayScrollbars } from "overlayscrollbars-react"
import { type RefObject, useEffect } from "react"

const MYREADER_OVERLAY_SCROLLBAR_OPTIONS = {
  overflow: {
    x: "hidden",
    y: "scroll",
  },
  scrollbars: {
    theme: "os-theme-myreader",
    visibility: "auto",
    autoHide: "leave",
    autoHideDelay: 700,
    autoHideSuspend: false,
    dragScroll: true,
    clickScroll: false,
  },
} satisfies PartialOptions

export function useOverlayScrollbar<
  TTarget extends HTMLElement,
  TViewport extends HTMLElement,
>(
  targetRef: RefObject<TTarget>,
  viewportRef: RefObject<TViewport>,
  enabled = true,
) {
  const [initialize, getInstance] = useOverlayScrollbars({
    defer: true,
    options: MYREADER_OVERLAY_SCROLLBAR_OPTIONS,
  })

  useEffect(() => {
    if (!enabled) {
      getInstance()?.destroy()
      return
    }

    const target = targetRef.current
    const viewport = viewportRef.current
    if (!target || !viewport) return

    initialize({
      target,
      elements: {
        viewport,
        padding: false,
        content: false,
      },
    })

    return () => {
      getInstance()?.destroy()
    }
  }, [enabled, getInstance, initialize, targetRef, viewportRef])
}
