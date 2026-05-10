import { cn } from "@/lib/utils"

interface ReaderBottomStatusBarProps {
  visible: boolean
  leftText?: string
  rightText?: string
  progress?: number
}

/**
 * 苹果 Books 风格底部状态栏：轻量悬浮，无实色背景，仅有极细进度线 + 两侧文字。
 */
export function ReaderBottomStatusBar({
  visible,
  leftText,
  rightText,
  progress,
}: ReaderBottomStatusBarProps) {
  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 z-40 flex flex-col transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {/* 极细进度线 */}
      <div className="relative h-[1px] w-full overflow-hidden">
        <div className="absolute inset-0 bg-reader-chrome-border/40" />
        {typeof progress === "number" ? (
          <div
            className="absolute left-0 top-0 h-full bg-reader-chrome-active/60 transition-[width] duration-300"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        ) : null}
      </div>
      {/* 文字行 */}
      <div className="flex items-center justify-between px-5 py-1.5">
        {leftText ? (
          <span className="text-[11px] text-reader-chrome-muted/80">{leftText}</span>
        ) : (
          <span />
        )}
        {rightText ? (
          <span className="text-[11px] text-reader-chrome-muted/80">{rightText}</span>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}
