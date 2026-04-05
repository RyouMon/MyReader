import { Columns2, Rows3, Square, SquareStack } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { DisplayMode, ReadingLayout } from "../types"

type ReaderChromeBottomShellProps = {
  visible: boolean
  children: ReactNode
}

/**
 * 阅读器底栏 Frost 容器与内层横向 flex 行。
 */
export function ReaderChromeBottomShell({
  visible,
  children,
}: ReaderChromeBottomShellProps) {
  return (
    <footer
      className={cn(
        "reader-chrome-frost absolute inset-x-0 bottom-0 z-45 flex h-16 flex-col justify-center border-t border-reader-chrome-border px-6 transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="flex items-center gap-3">{children}</div>
    </footer>
  )
}

type ReaderChromeTextNavButtonProps = {
  onClick: () => void
  children: ReactNode
}

export function ReaderChromeTextNavButton({
  onClick,
  children,
}: ReaderChromeTextNavButtonProps) {
  return (
    <button type="button" onClick={onClick} className="reader-chrome-text-btn">
      {children}
    </button>
  )
}

type ReaderChromeSegmentToggleProps = {
  active: boolean
  title: string
  onClick: () => void
  children: ReactNode
}

export function ReaderChromeSegmentToggle({
  active,
  title,
  onClick,
  children,
}: ReaderChromeSegmentToggleProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="reader-chrome-layout-toggle"
      data-active={active ? "true" : undefined}
    >
      {children}
    </button>
  )
}

type ReaderReadingLayoutToggleGroupProps = {
  readingLayout: ReadingLayout
  onReadingLayoutChange: (layout: ReadingLayout) => void
}

export function ReaderReadingLayoutToggleGroup({
  readingLayout,
  onReadingLayoutChange,
}: ReaderReadingLayoutToggleGroupProps) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-reader-chrome-border">
      <ReaderChromeSegmentToggle
        active={readingLayout === "paginate"}
        title="翻页"
        onClick={() => onReadingLayoutChange("paginate")}
      >
        <SquareStack className="size-4" />
      </ReaderChromeSegmentToggle>
      <ReaderChromeSegmentToggle
        active={readingLayout === "scroll"}
        title="滚动"
        onClick={() => onReadingLayoutChange("scroll")}
      >
        <Rows3 className="size-4" />
      </ReaderChromeSegmentToggle>
    </div>
  )
}

type ReaderDisplayModeToggleGroupProps = {
  displayMode: DisplayMode
  onDisplayModeChange: (mode: DisplayMode) => void
}

export function ReaderDisplayModeToggleGroup({
  displayMode,
  onDisplayModeChange,
}: ReaderDisplayModeToggleGroupProps) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-reader-chrome-border">
      <ReaderChromeSegmentToggle
        active={displayMode === "single"}
        title="单页"
        onClick={() => onDisplayModeChange("single")}
      >
        <Square className="size-4" />
      </ReaderChromeSegmentToggle>
      <ReaderChromeSegmentToggle
        active={displayMode === "spread"}
        title="双页"
        onClick={() => onDisplayModeChange("spread")}
      >
        <Columns2 className="size-4" />
      </ReaderChromeSegmentToggle>
    </div>
  )
}
