import type { LucideIcon } from "lucide-react"
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
        "reader-chrome-panel-aside absolute inset-y-0 z-60 flex w-[300px] flex-col transition-all duration-300 ease-out",
        isLeft
          ? "reader-chrome-panel-shadow-l left-0 border-r border-reader-chrome-border"
          : "reader-chrome-panel-shadow-r right-0 overflow-y-auto border-l border-reader-chrome-border",
        visible
          ? "translate-x-0 opacity-100"
          : isLeft
            ? "pointer-events-none -translate-x-full opacity-0"
            : "pointer-events-none translate-x-full opacity-0",
      )}
    >
      {children}
    </aside>
  )
}

type ReaderSidePanelHeaderProps = {
  title: string
  icon: LucideIcon
}

export function ReaderSidePanelHeader({ title, icon: Icon }: ReaderSidePanelHeaderProps) {
  return (
    <div className="font-serif flex items-center gap-2.5 border-b border-reader-chrome-border px-5 py-4 text-[15px] font-semibold text-reader-chrome-fg">
      <Icon className="size-[18px] opacity-60" />
      {title}
    </div>
  )
}
