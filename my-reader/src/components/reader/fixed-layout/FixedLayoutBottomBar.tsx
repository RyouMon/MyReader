import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Rows3,
  Square,
  SquareStack,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { BookProgressTrack } from "@/components/reader/shared/BookProgressTrack"
import type { DisplayMode } from "./FixedLayoutReader"
import type { ReadingLayout } from "../types"

interface FixedLayoutBottomBarProps {
  visible: boolean
  currentPage: number
  totalPages: number
  bookProgress: number
  readingLayout: ReadingLayout
  onReadingLayoutChange: (layout: ReadingLayout) => void
  onBookProgressSeek: (pct: number) => void
  displayMode: DisplayMode
  onPrevPage: () => void
  onNextPage: () => void
  onDisplayModeChange: (mode: DisplayMode) => void
}

export function FixedLayoutBottomBar({
  visible,
  currentPage,
  totalPages,
  bookProgress,
  readingLayout,
  onReadingLayoutChange,
  onBookProgressSeek,
  displayMode,
  onPrevPage,
  onNextPage,
  onDisplayModeChange,
}: FixedLayoutBottomBarProps) {
  const approxPage =
    totalPages > 0
      ? Math.min(
          totalPages,
          Math.max(1, Math.round((bookProgress / 100) * (totalPages - 1)) + 1),
        )
      : 0

  const pageInfo =
    readingLayout === "scroll"
      ? `约第 ${approxPage} 页 / 共 ${totalPages} 页 · 全书 ${bookProgress}%`
      : displayMode === "spread" && currentPage + 1 < totalPages
        ? `第 ${currentPage + 1}-${currentPage + 2} 页 / 共 ${totalPages} 页 · 全书 ${bookProgress}%`
        : `第 ${currentPage + 1} 页 / 共 ${totalPages} 页 · 全书 ${bookProgress}%`

  return (
    <footer
      className={cn(
        "reader-chrome-frost absolute inset-x-0 bottom-0 z-45 flex h-16 flex-col justify-center border-t border-reader-chrome-border px-6 transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="flex items-center gap-3">
        <NavBtn onClick={onPrevPage}>
          <ChevronLeft className="size-3.5" />
          {readingLayout === "scroll" ? "向上" : "上一页"}
        </NavBtn>

        <BookProgressTrack
          bookProgress={bookProgress}
          onBookProgressSeek={onBookProgressSeek}
        >
          <div className="text-[11.5px] tabular-nums text-reader-chrome-muted">
            {pageInfo}
          </div>
        </BookProgressTrack>

        <NavBtn onClick={onNextPage}>
          {readingLayout === "scroll" ? "向下" : "下一页"}
          <ChevronRight className="size-3.5" />
        </NavBtn>

        <div className="flex shrink-0 overflow-hidden rounded-lg border border-reader-chrome-border">
          <LayoutToggleBtn
            active={readingLayout === "paginate"}
            title="翻页"
            onClick={() => onReadingLayoutChange("paginate")}
          >
            <SquareStack className="size-4" />
          </LayoutToggleBtn>
          <LayoutToggleBtn
            active={readingLayout === "scroll"}
            title="滚动"
            onClick={() => onReadingLayoutChange("scroll")}
          >
            <Rows3 className="size-4" />
          </LayoutToggleBtn>
        </div>

        {readingLayout === "paginate" && (
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-reader-chrome-border">
            <DisplayToggleBtn
              active={displayMode === "single"}
              title="单页"
              onClick={() => onDisplayModeChange("single")}
            >
              <Square className="size-4" />
            </DisplayToggleBtn>
            <DisplayToggleBtn
              active={displayMode === "spread"}
              title="双页"
              onClick={() => onDisplayModeChange("spread")}
            >
              <Columns2 className="size-4" />
            </DisplayToggleBtn>
          </div>
        )}
      </div>
    </footer>
  )
}

function NavBtn({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} className="reader-chrome-text-btn">
      {children}
    </button>
  )
}

function LayoutToggleBtn({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
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

function DisplayToggleBtn({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
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
