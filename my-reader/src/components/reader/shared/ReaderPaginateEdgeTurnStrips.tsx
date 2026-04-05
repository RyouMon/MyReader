import { ChevronLeft, ChevronRight } from "lucide-react"
import { READER_PAGINATE_EDGE_PX } from "@/hooks/reader/useReaderPaginateEdgeTurn"
import { cn } from "@/lib/utils"

export type ReaderPaginateEdgeTurnStripsProps = {
  nearLeft: boolean
  nearRight: boolean
  onPrev: () => void
  onNext: () => void
  prevLabel: string
  nextLabel: string
  /** 与 `useReaderPaginateEdgeTurn` 的 `edgePx` 保持一致。 */
  edgeWidthPx?: number
}

/**
 * 分页模式下贴靠阅读区左右两侧的整高矩形热区；指针靠近边缘时显示磨砂圆形内的箭头提示。
 */
export function ReaderPaginateEdgeTurnStrips({
  nearLeft,
  nearRight,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  edgeWidthPx = READER_PAGINATE_EDGE_PX,
}: ReaderPaginateEdgeTurnStripsProps) {
  const stripStyle = { width: edgeWidthPx } as const

  return (
    <>
      <button
        type="button"
        aria-label={prevLabel}
        title={prevLabel}
        style={stripStyle}
        className={cn(
          "absolute inset-y-0 left-0 z-30 flex cursor-pointer touch-manipulation items-center justify-center",
          "border-none bg-transparent p-0 outline-none select-none",
          "transition-opacity duration-[220ms] ease-[ease]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        onClick={onPrev}
      >
        <span
          className={cn(
            "reader-chrome-frost-sm pointer-events-none flex size-11 shrink-0 items-center justify-center rounded-full transition-opacity duration-[220ms] ease-[ease]",
            nearLeft ? "opacity-100" : "opacity-0",
          )}
          aria-hidden
        >
          <ChevronLeft className="size-5" aria-hidden />
        </span>
      </button>
      <button
        type="button"
        aria-label={nextLabel}
        title={nextLabel}
        style={stripStyle}
        className={cn(
          "absolute inset-y-0 right-0 z-30 flex cursor-pointer touch-manipulation items-center justify-center",
          "border-none bg-transparent p-0 outline-none select-none",
          "transition-opacity duration-[220ms] ease-[ease]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        onClick={onNext}
      >
        <span
          className={cn(
            "reader-chrome-frost-sm pointer-events-none flex size-11 shrink-0 items-center justify-center rounded-full transition-opacity duration-[220ms] ease-[ease]",
            nearRight ? "opacity-100" : "opacity-0",
          )}
          aria-hidden
        >
          <ChevronRight className="size-5" aria-hidden />
        </span>
      </button>
    </>
  )
}
