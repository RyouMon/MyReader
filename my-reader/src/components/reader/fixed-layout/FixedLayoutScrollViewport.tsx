import { useVirtualizer } from "@tanstack/react-virtual"
import { Loader2 } from "lucide-react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"

import type { ImageChapterData } from "my-reader-tools/rendition"

import type { ZoomMode } from "../types"

export type FixedLayoutScrollViewportHandle = {
  scrollToPageIndex: (index: number) => void
}

interface FixedLayoutScrollViewportProps {
  totalPages: number
  getChapter: (
    index: number,
  ) => Promise<import("my-reader-tools/rendition").ChapterData | null>
  scrollRef: React.RefObject<HTMLDivElement>
  brightness: number
  zoomMode: ZoomMode
  /** 可选；底栏进度可由 {@link BookReader#getProgress} 驱动 */
  onScrollProgress?: (pct: number) => void
  /** 与 {@link BookReader} 当前 spine 对齐的可见页（0-based） */
  onVisiblePageIndexChange?: (pageIndex: number) => void
  /** 虚拟列表当前可见行下标；用于 {@link FixedLayoutEngine} 预取解码页 */
  onVisiblePageIndicesChange?: (indices: readonly number[]) => void
}

/**
 * 固定版式（CBZ / 图片 PDF 等）纵向连续滚动，虚拟列表按页懒加载。
 */
export const FixedLayoutScrollViewport = forwardRef<
  FixedLayoutScrollViewportHandle,
  FixedLayoutScrollViewportProps
>(function FixedLayoutScrollViewport(
  {
    totalPages,
    getChapter,
    scrollRef,
    brightness,
    zoomMode,
    onScrollProgress,
    onVisiblePageIndexChange,
    onVisiblePageIndicesChange,
  },
  ref,
) {
  const parentRef = scrollRef
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressVisibleSyncUntilRef = useRef(0)

  const virtualizer = useVirtualizer({
    count: totalPages,
    getScrollElement: () => parentRef.current,
    estimateSize: () => {
      if (typeof window === "undefined") return 720
      const w = window.innerWidth
      const h = window.innerHeight
      const byAspect = Math.round(w * 1.45 + 56)
      const byViewport = Math.round(h * 1.12 + 56)
      return Math.min(2400, Math.max(320, byAspect, byViewport))
    },
    overscan: 2,
    useAnimationFrameWithResizeObserver: true,
  })

  useImperativeHandle(
    ref,
    () => ({
      scrollToPageIndex: (index: number) => {
        suppressVisibleSyncUntilRef.current = Date.now() + 320
        virtualizer.scrollToIndex(Math.max(0, index), { align: "start" })
      },
    }),
    [virtualizer],
  )

  const handleScroll = useCallback(() => {
    const el = parentRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    const pct = max <= 0 ? 100 : Math.round((el.scrollTop / max) * 100)
    onScrollProgress?.(pct)
    const items = virtualizer.getVirtualItems()
    if (items.length > 0) {
      onVisiblePageIndicesChange?.(items.map((v) => v.index))
    }
    if (!onVisiblePageIndexChange) return
    if (items.length === 0) return
    const center = el.scrollTop + el.clientHeight / 2
    let best = items[0].index
    let bestDist = Number.POSITIVE_INFINITY
    for (const vi of items) {
      const mid = (vi.start + vi.end) / 2
      const d = Math.abs(center - mid)
      if (d < bestDist) {
        bestDist = d
        best = vi.index
      }
    }
    if (Date.now() < suppressVisibleSyncUntilRef.current) return
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current)
    syncDebounceRef.current = setTimeout(() => {
      syncDebounceRef.current = null
      if (Date.now() < suppressVisibleSyncUntilRef.current) return
      onVisiblePageIndexChange(best)
    }, 90)
  }, [
    parentRef,
    onScrollProgress,
    onVisiblePageIndexChange,
    onVisiblePageIndicesChange,
    virtualizer,
  ])

  // biome-ignore lint/correctness/useExhaustiveDependencies: parentRef is stable scroll root; observe its current node
  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const ro = new ResizeObserver(() => handleScroll())
    ro.observe(el)
    const id = window.requestAnimationFrame(() => {
      handleScroll()
      const vis = virtualizer.getVirtualItems()
      if (vis.length > 0) {
        onVisiblePageIndicesChange?.(vis.map((v) => v.index))
      }
    })
    return () => {
      window.cancelAnimationFrame(id)
      ro.disconnect()
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current)
    }
  }, [handleScroll, virtualizer, onVisiblePageIndicesChange])

  return (
    <div
      ref={parentRef}
      className="fixed-layout-scroll-viewport relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-viewer-bg"
      style={{
        filter:
          brightness < 100 ? `brightness(${brightness / 100})` : undefined,
      }}
      onScroll={handleScroll}
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((vi) => (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full px-4 py-3"
            style={{ transform: `translateY(${vi.start}px)` }}
          >
            <FixedLayoutScrollPageRow
              index={vi.index}
              getChapter={getChapter}
              zoomMode={zoomMode}
            />
          </div>
        ))}
      </div>
    </div>
  )
})

function FixedLayoutScrollPageRow({
  index,
  getChapter,
  zoomMode,
}: {
  index: number
  getChapter: (
    index: number,
  ) => Promise<import("my-reader-tools/rendition").ChapterData | null>
  zoomMode: ZoomMode
}) {
  const [page, setPage] = useState<ImageChapterData | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPage(null)
    setErr(null)
    getChapter(index)
      .then((ch) => {
        if (cancelled) return
        if (ch?.type === "image") setPage(ch)
        else setErr("无法加载")
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [index, getChapter])

  const zoomStyle =
    zoomMode === "fit-width"
      ? { maxWidth: "100%", height: "auto" as const }
      : zoomMode === "original"
        ? { maxWidth: "none" as const, height: "auto" as const }
        : { maxWidth: "100%", maxHeight: "none", height: "auto" as const }

  if (err) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-reader-chrome-muted">
        {err}
      </div>
    )
  }

  if (!page) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-reader-chrome-muted">
        <Loader2 className="size-7 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex justify-center">
      <img
        src={page.imageUrl}
        alt={page.title}
        className="fixed-layout-page-img rounded-sm shadow-lg"
        style={zoomStyle}
        draggable={false}
      />
    </div>
  )
}
