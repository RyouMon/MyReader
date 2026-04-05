import {
  ChevronLeft,
  ChevronRight,
  Headphones,
  Rows3,
  SquareStack,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { BookProgressTrack } from "@/components/reader/shared/BookProgressTrack"
import type { ReadingLayout } from "../types"

interface ReflowableBottomBarProps {
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

export function ReflowableBottomBar({
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
}: ReflowableBottomBarProps) {
  return (
    <footer
      className={cn(
        "reader-chrome-frost absolute inset-x-0 bottom-0 z-45 flex h-16 flex-col justify-center border-t border-reader-chrome-border px-6 transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="flex items-center gap-3">
        <ChapterNavBtn onClick={onPrevChapter}>
          <ChevronLeft className="size-3.5" />
          上一章
        </ChapterNavBtn>

        <BookProgressTrack
          bookProgress={bookProgress}
          onBookProgressSeek={onBookProgressSeek}
        >
          <div className="text-[11.5px] tabular-nums text-reader-chrome-muted">
            第 {currentChapter} 章 / 共 {totalChapters} 章 · 全书 {bookProgress}
            %
          </div>
        </BookProgressTrack>

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
