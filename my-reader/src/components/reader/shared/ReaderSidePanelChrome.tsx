import type { LucideIcon } from "lucide-react"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type ReaderSidePanelFrameProps = {
  visible: boolean
  /** 左侧（目录等）或右侧（设置等）滑入方向与阴影。 */
  side: "left" | "right"
  children: ReactNode
}

/**
 * 阅读器侧栏 aside：定位、宽度、滑入动画与边框；右侧默认整块可纵向滚动。
 */
export function ReaderSidePanelFrame({
  visible,
  side,
  children,
}: ReaderSidePanelFrameProps) {
  const isLeft = side === "left"
  return (
    <aside
      className={cn(
        "reader-chrome-panel-aside absolute inset-y-0 z-[60] flex w-[300px] flex-col transition-transform duration-300 ease-out",
        isLeft
          ? "reader-chrome-panel-shadow-l start-0 border-e border-reader-chrome-border"
          : "reader-chrome-panel-shadow-r end-0 overflow-y-auto border-s border-reader-chrome-border",
        visible
          ? "translate-x-0"
          : isLeft
            ? "pointer-events-none -translate-x-full"
            : "pointer-events-none translate-x-full",
      )}
    >
      {children}
    </aside>
  )
}

type ReaderSidePanelHeaderProps = {
  title: string
  icon: LucideIcon
  onClose?: () => void
}

export function ReaderSidePanelHeader({ title, icon: Icon, onClose }: ReaderSidePanelHeaderProps) {
  return (
    <div className="font-serif flex min-h-[52px] items-center justify-between gap-2 border-b border-reader-chrome-border px-4 py-3 text-[15px] font-semibold text-reader-chrome-fg sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className="size-[18px] shrink-0 opacity-60" />
        <span className="truncate">{title}</span>
      </div>
      {onClose ? (
        <button
          type="button"
          className="reader-chrome-icon-btn shrink-0"
          title="关闭"
          aria-label="关闭"
          onClick={onClose}
        >
          <X className="size-[18px]" />
        </button>
      ) : null}
    </div>
  )
}
