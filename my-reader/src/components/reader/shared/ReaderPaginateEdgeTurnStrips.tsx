import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

export type ReaderPaginateEdgeTurnStripsProps = {
  direction?: "ltr" | "rtl"
  showPrev: boolean
  showNext: boolean
  onPrev: () => void
  onNext: () => void
  prevLabel: string
  nextLabel: string
  /** 须高于 FXL iframe 叠层（漫画等），默认 `z-[50]`。 */
  buttonZClass?: string
}

/**
 * 分页模式下贴靠阅读区左右两侧的窄翻页按钮。
 */
export function ReaderPaginateEdgeTurnStrips({
  direction = "ltr",
  showPrev,
  showNext,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  buttonZClass = "z-[50]",
}: ReaderPaginateEdgeTurnStripsProps) {
  const [hoverLeft, setHoverLeft] = useState(false)
  const [hoverRight, setHoverRight] = useState(false)
  const isRtl = direction === "rtl"
  const leftVisible = (isRtl ? showNext : showPrev) || hoverLeft
  const rightVisible = (isRtl ? showPrev : showNext) || hoverRight
  const onLeft = isRtl ? onNext : onPrev
  const onRight = isRtl ? onPrev : onNext
  const leftLabel = isRtl ? nextLabel : prevLabel
  const rightLabel = isRtl ? prevLabel : nextLabel

  return (
    <>
      <div
        className="absolute inset-y-0 start-0 z-[49] w-16"
        onPointerEnter={() => {
          setHoverLeft(true)
          setHoverRight(false)
        }}
        onPointerMove={() => {
          setHoverLeft(true)
          setHoverRight(false)
        }}
        onPointerLeave={() => setHoverLeft(false)}
      >
        <button
          type="button"
          aria-label={leftLabel}
          title={leftLabel}
          className={cn(
            "reader-edge-turn-btn absolute start-[9px] top-1/2 flex -translate-y-1/2 cursor-pointer touch-manipulation items-center justify-center border-none p-0 outline-none select-none",
            buttonZClass,
            leftVisible
              ? "pointer-events-auto opacity-100 scale-100"
              : "pointer-events-none opacity-0 scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
          onClick={onLeft}
        >
          <ChevronLeft className="size-[18px]" aria-hidden />
        </button>
      </div>
      <div
        className="absolute inset-y-0 end-0 z-[49] w-16"
        onPointerEnter={() => {
          setHoverRight(true)
          setHoverLeft(false)
        }}
        onPointerMove={() => {
          setHoverRight(true)
          setHoverLeft(false)
        }}
        onPointerLeave={() => setHoverRight(false)}
      >
        <button
          type="button"
          aria-label={rightLabel}
          title={rightLabel}
          className={cn(
            "reader-edge-turn-btn absolute end-[9px] top-1/2 flex -translate-y-1/2 cursor-pointer touch-manipulation items-center justify-center border-none p-0 outline-none select-none",
            buttonZClass,
            rightVisible
              ? "pointer-events-auto opacity-100 scale-100"
              : "pointer-events-none opacity-0 scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
          onClick={onRight}
        >
          <ChevronRight className="size-[18px]" aria-hidden />
        </button>
      </div>
    </>
  )
}
