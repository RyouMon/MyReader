import type { CalibreBook } from "@my-reader/tools/types/book"
import { isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { memo, useCallback, useEffect, useState } from "react"
import { buildCoverUrl, bumpCoverVersion } from "@/lib/cover"
import { cn } from "@/lib/utils"

export interface BookProgressSnapshot {
  percent?: number
  statusLabel?: string
  syncedLabel?: string
}

const brokenCovers = new Set<string>()

/**
 * Generates a stable fallback gradient from the book title.
 */
export function generateCoverGradient(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360
  return `linear-gradient(148deg, hsl(${hue}, 32%, 30%) 0%, hsl(${(hue + 24) % 360}, 28%, 18%) 100%)`
}

/** Clear the broken-covers cache and bump version so covers re-render. */
export function resetBrokenCovers() {
  brokenCovers.clear()
  bumpCoverVersion()
}

interface BookCoverProps {
  book: CalibreBook
  libraryId: string | null
  className?: string
  imageClassName?: string
  fallbackClassName?: string
  titleClassName?: string
  spineClassName?: string
  progress?: BookProgressSnapshot
  showProgress?: boolean
}

/**
 * Renders a real or generated book cover for desktop library views.
 */
export const BookCover = memo(function BookCover({
  book,
  libraryId,
  className,
  imageClassName,
  fallbackClassName,
  titleClassName,
  spineClassName,
  progress,
  showProgress = true,
}: BookCoverProps) {
  const [imgFailed, setImgFailed] = useState(() => brokenCovers.has(book.path))
  // When WebDAV covers finish downloading, clear broken state so covers re-render
  useEffect(() => {
    if (!isTauri()) return
    const unlisten = listen<string>("webdav-covers-downloaded", () => {
      brokenCovers.delete(book.path)
      setImgFailed(false)
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [book.path])
  const coverSrc =
    book.hasCover && libraryId && !imgFailed
      ? buildCoverUrl(libraryId, book.path)
      : null
  const progressPercent =
    typeof progress?.percent === "number"
      ? Math.max(0, Math.min(100, progress.percent))
      : undefined

  const handleImgError = useCallback(() => {
    brokenCovers.add(book.path)
    setImgFailed(true)
  }, [book.path])

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-muted shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {coverSrc ? (
        <img
          src={coverSrc}
          alt={book.title}
          className={cn(
            "absolute inset-0 size-full object-cover",
            imageClassName,
          )}
          loading="lazy"
          decoding="async"
          onError={handleImgError}
        />
      ) : (
        <div
          className={cn(
            "absolute inset-0 flex size-full flex-col items-center justify-end px-2.5 py-3 text-center",
            fallbackClassName,
          )}
          style={{ background: generateCoverGradient(book.title) }}
        >
          <span
            className={cn(
              "relative z-10 line-clamp-3 font-serif text-[10px] font-semibold leading-[1.4] text-ink-inverse [text-shadow:0_1px_3px_rgba(0,0,0,0.3)]",
              titleClassName,
            )}
          >
            {book.title}
          </span>
        </div>
      )}

      <div
        className={cn(
          "absolute inset-y-0 start-0 w-1.5 bg-black/20",
          spineClassName,
        )}
      />

      {showProgress && typeof progressPercent === "number" ? (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-ink-inverse/20">
          <div
            className="h-full rounded-full bg-ink-inverse/75"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      ) : null}
    </div>
  )
})