import { type CSSProperties, type ReactNode, useCallback, useRef } from "react"

interface BookProgressTrackProps {
  bookProgress: number
  onBookProgressSeek: (pct: number) => void
  children?: ReactNode
}

/**
 * 全书进度滑轨：在 `.reader-progress-wrap` 上设置 `--reader-book-progress`（0–100），
 * 具体填充与拖头样式见 `reader.css`。
 */
export function BookProgressTrack({
  bookProgress,
  onBookProgressSeek,
  children,
}: BookProgressTrackProps) {
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

  const progressStyle = {
    "--reader-book-progress": String(bookProgress),
  } as CSSProperties

  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <div
        ref={trackRef}
        className="reader-progress-wrap flex h-5 w-full cursor-pointer items-center"
        style={progressStyle}
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
          <div className="reader-progress-fill" />
        </div>
        <div className="reader-progress-thumb" />
      </div>
      {children}
    </div>
  )
}
