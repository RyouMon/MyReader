import {
  ChevronLeft,
  ChevronRight,
  Headphones,
  Rows3,
  SquareStack,
} from "lucide-react"
import { useCallback, useRef } from "react"

import { cn } from "@/lib/utils"

import type { ReadingLayout } from "./types"

interface ReaderBottomBarProps {
  visible: boolean
  currentChapter: number
  totalChapters: number
  bookProgress: number
  readingLayout: ReadingLayout
  onReadingLayoutChange: (layout: ReadingLayout) => void
  onBookProgressSeek: (pct: number) => void
  ttsActive: boolean
  onPrevChapter: () => void
  onNextChapter: () => void
  onToggleTts: () => void
}

export function ReaderBottomBar({
  visible,
  currentChapter,
  totalChapters,
  bookProgress,
  readingLayout,
  onReadingLayoutChange,
  onBookProgressSeek,
  ttsActive,
  onPrevChapter,
  onNextChapter,
  onToggleTts,
}: ReaderBottomBarProps) {
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

  return (
    <footer
      className={cn(
        "reader-chrome-frost absolute inset-x-0 bottom-0 z-45 flex h-16 flex-col justify-center border-t border-reader-chrome-border px-6 transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
    >
      <div className="flex items-center gap-3">
        <ChapterNavBtn onClick={onPrevChapter}>
          <ChevronLeft className="size-3.5" />
          上一章
        </ChapterNavBtn>

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
            第 {currentChapter} 章 / 共 {totalChapters} 章 · 全书 {bookProgress}
            %
          </div>
        </div>

        <ChapterNavBtn onClick={onNextChapter}>
          下一章
          <ChevronRight className="size-3.5" />
        </ChapterNavBtn>

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

        <button
          type="button"
          title="TTS 朗读"
          onClick={onToggleTts}
          className={cn(
            "reader-chrome-icon-btn reader-chrome-tts-toggle shrink-0",
          )}
          data-pressed={ttsActive ? "true" : undefined}
        >
          <Headphones className="size-[18px]" />
        </button>
      </div>
    </footer>
  )
}

function ChapterNavBtn({
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
