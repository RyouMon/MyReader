import type {
  OverlayScrollbars as OverlayScrollbarsInstance,
  PartialOptions,
  ScrollbarsAutoHideBehavior,
} from "overlayscrollbars"
import { type RefObject, useEffect, useMemo } from "react"

let overlayScrollbarsModule: Promise<
  typeof import("overlayscrollbars")
> | null = null

function loadOverlayScrollbars() {
  if (overlayScrollbarsModule) return overlayScrollbarsModule

  const scrollTimelineDescriptor = Object.getOwnPropertyDescriptor(
    window,
    "ScrollTimeline",
  )

  if (scrollTimelineDescriptor) {
    Object.defineProperty(window, "ScrollTimeline", {
      configurable: true,
      value: undefined,
      writable: true,
    })
  }

  overlayScrollbarsModule = import("overlayscrollbars").finally(() => {
    if (scrollTimelineDescriptor) {
      Object.defineProperty(window, "ScrollTimeline", scrollTimelineDescriptor)
    }
  })

  return overlayScrollbarsModule
}

function getOverlayScrollbarOptions(
  autoHide: ScrollbarsAutoHideBehavior,
): PartialOptions {
  return {
    overflow: {
      x: "hidden",
      y: "scroll",
    },
    scrollbars: {
      theme: "os-theme-myreader",
      visibility: "auto",
      autoHide,
      autoHideDelay: 700,
      autoHideSuspend: false,
      dragScroll: true,
      clickScroll: false,
    },
  }
}

function syncVerticalScrollbarPosition(
  viewport: HTMLElement,
  scrollbar: HTMLElement,
) {
  const maximum = viewport.scrollHeight - viewport.clientHeight
  const progress =
    maximum > 0 ? Math.min(1, Math.max(0, viewport.scrollTop / maximum)) : 0

  scrollbar.style.setProperty("--os-scroll-percent", String(progress))
}

export function useOverlayScrollbar<
  TTarget extends HTMLElement,
  TViewport extends HTMLElement,
  TContent extends HTMLElement = HTMLElement,
>(
  targetRef: RefObject<TTarget>,
  viewportRef: RefObject<TViewport>,
  enabled = true,
  contentRef?: RefObject<TContent>,
  autoHide: ScrollbarsAutoHideBehavior = "leave",
) {
  const options = useMemo(
    () => getOverlayScrollbarOptions(autoHide),
    [autoHide],
  )

  useEffect(() => {
    if (!enabled) return

    const target = targetRef.current
    const viewport = viewportRef.current
    const content = contentRef?.current
    if (!target || !viewport || (contentRef && !content)) return

    let cancelled = false
    let instance: OverlayScrollbarsInstance | null = null
    let stopPositionSync: (() => void) | null = null

    void loadOverlayScrollbars().then(({ OverlayScrollbars }) => {
      if (cancelled) return

      instance = OverlayScrollbars(
        {
          target,
          elements: {
            viewport,
            padding: false,
            content: content ?? false,
          },
        },
        options,
      )

      const verticalScrollbar = instance.elements().scrollbarVertical.scrollbar
      const syncPosition = () =>
        syncVerticalScrollbarPosition(viewport, verticalScrollbar)
      const stopUpdatedListener = instance.on("updated", syncPosition)

      viewport.addEventListener("scroll", syncPosition, { passive: true })
      syncPosition()

      stopPositionSync = () => {
        viewport.removeEventListener("scroll", syncPosition)
        stopUpdatedListener()
      }
    })

    return () => {
      cancelled = true
      stopPositionSync?.()
      instance?.destroy()
    }
  }, [contentRef, enabled, options, targetRef, viewportRef])
}
