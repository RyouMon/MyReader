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
        "absolute inset-x-0 bottom-0 z-45 flex h-16 flex-col justify-center px-6 transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
      style={{
        background:
          "color-mix(in srgb, var(--reader-chrome-bg) 92%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid var(--reader-chrome-border)",
        transition:
          "opacity 300ms ease-out, background 350ms ease, border-color 350ms ease",
      }}
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
          <div
            className="text-[11.5px] tabular-nums"
            style={{ color: "var(--reader-chrome-muted)" }}
          >
            第 {currentChapter} 章 / 共 {totalChapters} 章 · 全书 {bookProgress}
            %
          </div>
        </div>

        <ChapterNavBtn onClick={onNextChapter}>
          下一章
          <ChevronRight className="size-3.5" />
        </ChapterNavBtn>

        <div
          className="flex shrink-0 overflow-hidden rounded-lg"
          style={{ border: "1px solid var(--reader-chrome-border)" }}
        >
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
            "flex size-9 shrink-0 items-center justify-center rounded-lg border-none transition-all active:scale-95",
          )}
          style={{
            background: ttsActive
              ? "color-mix(in srgb, var(--reader-chrome-active) 10%, transparent)"
              : "transparent",
            color: ttsActive
              ? "var(--reader-chrome-active)"
              : "var(--reader-chrome-muted)",
          }}
          onMouseEnter={(e) => {
            if (!ttsActive) {
              e.currentTarget.style.background = "var(--reader-chrome-hover)"
              e.currentTarget.style.color = "var(--reader-chrome-fg)"
            }
          }}
          onMouseLeave={(e) => {
            if (!ttsActive) {
              e.currentTarget.style.background = "transparent"
              e.currentTarget.style.color = "var(--reader-chrome-muted)"
            }
          }}
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
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 whitespace-nowrap rounded-md border-none px-3 py-1.5 text-[13px] transition-all active:scale-95"
      style={{
        background: "transparent",
        color: "var(--reader-chrome-muted)",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--reader-chrome-hover)"
        e.currentTarget.style.color = "var(--reader-chrome-fg)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent"
        e.currentTarget.style.color = "var(--reader-chrome-muted)"
      }}
    >
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
      className="flex items-center justify-center border-none px-2.5 py-1.5 transition-all"
      style={{
        background: active
          ? "color-mix(in srgb, var(--reader-chrome-active) 12%, transparent)"
          : "transparent",
        color: active
          ? "var(--reader-chrome-active)"
          : "var(--reader-chrome-muted)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--reader-chrome-hover)"
          e.currentTarget.style.color = "var(--reader-chrome-fg)"
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent"
          e.currentTarget.style.color = "var(--reader-chrome-muted)"
        }
      }}
    >
      {children}
    </button>
  )
}
