import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Rows3,
  Square,
  SquareStack,
} from "lucide-react"
import { useCallback, useRef } from "react"

import { cn } from "@/lib/utils"
import type { DisplayMode } from "./ComicReader"
import type { ReadingLayout } from "./types"

interface ComicBottomBarProps {
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

export function ComicBottomBar({
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
}: ComicBottomBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect) return
      const pct = Math.max(
        0,
        Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
      )
      onBookProgressSeek(pct)
    },
    [onBookProgressSeek],
  )

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

        <div className="flex flex-1 flex-col items-center gap-1">
          <div
            ref={trackRef}
            className="reader-progress-wrap flex h-5 w-full cursor-pointer items-center"
            onClick={handleProgressClick}
            role="slider"
            aria-valuenow={bookProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault()
                onBookProgressSeek(Math.max(0, bookProgress - 5))
              }
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault()
                onBookProgressSeek(Math.min(100, bookProgress + 5))
              }
            }}
          >
            <div className="reader-progress-track">
              <div
                className="reader-progress-fill"
                style={{ width: `${bookProgress}%` }}
              />
            </div>
            <div
              className="reader-progress-thumb"
              style={{ left: `${bookProgress}%` }}
            />
          </div>
          <div className="text-[11.5px] tabular-nums text-reader-chrome-muted">
            {pageInfo}
          </div>
        </div>

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
