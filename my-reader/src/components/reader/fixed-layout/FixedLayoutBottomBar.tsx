import { ChevronLeft, ChevronRight } from "lucide-react"

import { BookProgressTrack } from "@/components/reader/shared/BookProgressTrack"
import {
  ReaderChromeBottomShell,
  ReaderChromeTextNavButton,
  ReaderDisplayModeToggleGroup,
  ReaderReadingLayoutToggleGroup,
} from "@/components/reader/shared/ReaderChromeBottomPrimitives"
import type { DisplayMode, ReadingLayout } from "../types"

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
    <ReaderChromeBottomShell visible={visible}>
      <ReaderChromeTextNavButton onClick={onPrevPage}>
        <ChevronLeft className="size-3.5" />
        {readingLayout === "scroll" ? "向上" : "上一页"}
      </ReaderChromeTextNavButton>

      <BookProgressTrack
        bookProgress={bookProgress}
        onBookProgressSeek={onBookProgressSeek}
      >
        <div className="text-[11.5px] tabular-nums text-reader-chrome-muted">
          {pageInfo}
        </div>
      </BookProgressTrack>

      <ReaderChromeTextNavButton onClick={onNextPage}>
        {readingLayout === "scroll" ? "向下" : "下一页"}
        <ChevronRight className="size-3.5" />
      </ReaderChromeTextNavButton>

      <ReaderReadingLayoutToggleGroup
        readingLayout={readingLayout}
        onReadingLayoutChange={onReadingLayoutChange}
      />

      {readingLayout === "paginate" && (
        <ReaderDisplayModeToggleGroup
          displayMode={displayMode}
          onDisplayModeChange={onDisplayModeChange}
        />
      )}
    </ReaderChromeBottomShell>
  )
}
