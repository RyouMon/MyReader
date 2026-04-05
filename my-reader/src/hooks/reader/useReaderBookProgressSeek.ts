import { useCallback, type RefObject } from "react"
import type { ReadingLayout } from "@/components/reader/types"

export type UseReaderBookProgressSeekArgs = {
  readingLayout: ReadingLayout
  scrollContainerRef: RefObject<HTMLElement | null>
  /** 分页模式下离散单元的数量（章或页）。 */
  paginateUnitCount: number
  /** 分页模式下跳到指定单元索引（0-based）。 */
  seekPaginate: (index: number) => void
}

/**
 * 将 0–100 的「全书进度」映射为滚动容器的平滑滚动或分页模式下的离散跳转，
 * 供流式与固定版式阅读器共用。
 */
export function useReaderBookProgressSeek({
  readingLayout,
  scrollContainerRef,
  paginateUnitCount,
  seekPaginate,
}: UseReaderBookProgressSeekArgs) {
  return useCallback(
    (pct: number) => {
      const p = Math.max(0, Math.min(100, pct))
      if (readingLayout === "scroll") {
        const el = scrollContainerRef.current
        if (!el) return
        const max = el.scrollHeight - el.clientHeight
        if (max <= 0) return
        el.scrollTo({ top: (p / 100) * max, behavior: "smooth" })
        return
      }
      if (paginateUnitCount <= 0) return
      const idx = Math.round((p / 100) * Math.max(0, paginateUnitCount - 1))
      seekPaginate(idx)
    },
    [readingLayout, scrollContainerRef, paginateUnitCount, seekPaginate],
  )
}
