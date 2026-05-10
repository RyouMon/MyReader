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
  /** 须高于 FXL iframe 叠层（漫画等），默认 `z-[50]`。 */
  stripZClass?: string
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
  stripZClass = "z-[50]",
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
          "absolute inset-y-0 left-0 flex cursor-pointer touch-manipulation items-center justify-center",
          stripZClass,
          "border-none bg-transparent p-0 outline-none select-none",
          "transition-opacity duration-[220ms] ease-[ease]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        onClick={onPrev}
      >
        <span
          className={cn(
            "reader-edge-turn-btn pointer-events-none flex size-10 shrink-0 items-center justify-center rounded-full transition-all duration-[220ms] ease-[ease]",
            nearLeft ? "opacity-100 scale-100" : "opacity-0 scale-90",
          )}
          aria-hidden
        >
          <ChevronLeft className="size-[18px]" aria-hidden />
        </span>
      </button>
      <button
        type="button"
        aria-label={nextLabel}
        title={nextLabel}
        style={stripStyle}
        className={cn(
          "absolute inset-y-0 right-0 flex cursor-pointer touch-manipulation items-center justify-center",
          stripZClass,
          "border-none bg-transparent p-0 outline-none select-none",
          "transition-opacity duration-[220ms] ease-[ease]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        onClick={onNext}
      >
        <span
          className={cn(
            "reader-edge-turn-btn pointer-events-none flex size-10 shrink-0 items-center justify-center rounded-full transition-all duration-[220ms] ease-[ease]",
            nearRight ? "opacity-100 scale-100" : "opacity-0 scale-90",
          )}
          aria-hidden
        >
          <ChevronRight className="size-[18px]" aria-hidden />
        </span>
      </button>
    </>
  )
}
