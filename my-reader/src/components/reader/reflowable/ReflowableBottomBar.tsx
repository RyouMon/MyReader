import { ChevronLeft, ChevronRight, Headphones } from "lucide-react"

import { BookProgressTrack } from "@/components/reader/shared/BookProgressTrack"
import {
  ReaderChromeBottomShell,
  ReaderChromeTextNavButton,
  ReaderReadingLayoutToggleGroup,
} from "@/components/reader/shared/ReaderChromeBottomPrimitives"
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
    <ReaderChromeBottomShell visible={visible}>
      <ReaderChromeTextNavButton onClick={onPrevChapter}>
        <ChevronLeft className="size-3.5" />
        上一章
      </ReaderChromeTextNavButton>

      <BookProgressTrack
        bookProgress={bookProgress}
        onBookProgressSeek={onBookProgressSeek}
      >
        <div className="text-[11.5px] tabular-nums text-reader-chrome-muted">
          第 {currentChapter} 章 / 共 {totalChapters} 章 · 全书 {bookProgress}%
        </div>
      </BookProgressTrack>

      <ReaderChromeTextNavButton onClick={onNextChapter}>
        下一章
        <ChevronRight className="size-3.5" />
      </ReaderChromeTextNavButton>

      <ReaderReadingLayoutToggleGroup
        readingLayout={readingLayout}
        onReadingLayoutChange={onReadingLayoutChange}
      />

      <button
        type="button"
        title="TTS 朗读"
        onClick={onToggleTts}
        className="reader-chrome-icon-btn reader-chrome-tts-toggle shrink-0"
        data-pressed={ttsActive ? "true" : undefined}
      >
        <Headphones className="size-[18px]" />
      </button>
    </ReaderChromeBottomShell>
  )
}
