import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

export type ReaderPaginateEdgeTurnStripsProps = {
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
  showPrev,
  showNext,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  buttonZClass = "z-[50]",
}: ReaderPaginateEdgeTurnStripsProps) {
  const [hoverPrev, setHoverPrev] = useState(false)
  const [hoverNext, setHoverNext] = useState(false)
  const prevVisible = showPrev || hoverPrev
  const nextVisible = showNext || hoverNext

  return (
    <>
      <div
        className="absolute inset-y-0 start-0 z-[49] w-16"
        onPointerEnter={() => {
          setHoverPrev(true)
          setHoverNext(false)
        }}
        onPointerMove={() => {
          setHoverPrev(true)
          setHoverNext(false)
        }}
        onPointerLeave={() => setHoverPrev(false)}
      >
        <button
          type="button"
          aria-label={prevLabel}
          title={prevLabel}
          className={cn(
            "reader-edge-turn-btn absolute start-[9px] top-1/2 flex -translate-y-1/2 cursor-pointer touch-manipulation items-center justify-center border-none p-0 outline-none select-none",
            buttonZClass,
            prevVisible
              ? "pointer-events-auto opacity-100 scale-100"
              : "pointer-events-none opacity-0 scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
          onClick={onPrev}
        >
          <ChevronLeft className="size-[18px]" aria-hidden />
        </button>
      </div>
      <div
        className="absolute inset-y-0 end-0 z-[49] w-16"
        onPointerEnter={() => {
          setHoverNext(true)
          setHoverPrev(false)
        }}
        onPointerMove={() => {
          setHoverNext(true)
          setHoverPrev(false)
        }}
        onPointerLeave={() => setHoverNext(false)}
      >
        <button
          type="button"
          aria-label={nextLabel}
          title={nextLabel}
          className={cn(
            "reader-edge-turn-btn absolute end-[9px] top-1/2 flex -translate-y-1/2 cursor-pointer touch-manipulation items-center justify-center border-none p-0 outline-none select-none",
            buttonZClass,
            nextVisible
              ? "pointer-events-auto opacity-100 scale-100"
              : "pointer-events-none opacity-0 scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
          onClick={onNext}
        >
          <ChevronRight className="size-[18px]" aria-hidden />
        </button>
      </div>
    </>
  )
}
