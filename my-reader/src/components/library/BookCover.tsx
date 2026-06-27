import type { CalibreBook } from "@my-reader/tools/types/book"
import { memo, useCallback, useState } from "react"
import { buildCoverUrl } from "@/lib/cover"
import { generateCoverGradient } from "@/lib/cover-gradient"
import { cn } from "@/lib/utils"

export interface BookProgressSnapshot {
  percent?: number
  statusLabel?: string
  syncedLabel?: string
}

const brokenCovers = new Set<string>()

/** Clear the broken-covers cache so covers re-render. */
export function resetBrokenCovers() {
  brokenCovers.clear()
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
  /** Show title/author on the generated fallback cover. Defaults to true. */
  showFallbackMeta?: boolean
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
  showFallbackMeta = true,
}: BookCoverProps) {
  const [imgFailed, setImgFailed] = useState(() => brokenCovers.has(book.path))
  const [imgLoaded, setImgLoaded] = useState(false)
  const coverSrc =
    book.hasCover && libraryId && !imgFailed
      ? buildCoverUrl(libraryId, book.path)
      : null
  const progressPercent =
    typeof progress?.percent === "number"
      ? Math.max(0, Math.min(100, progress.percent))
      : undefined

  const handleImgLoad = useCallback(() => {
    setImgLoaded(true)
  }, [])

  const handleImgError = useCallback(() => {
    brokenCovers.add(book.path)
    setImgLoaded(false)
    setImgFailed(true)
  }, [book.path])

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-muted shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {/* Base colored layer: always visible so the cover area never looks blank while an image is loading/decoding. */}
      <div
        className="absolute inset-0"
        style={{ background: generateCoverGradient(book.title) }}
        aria-hidden="true"
      />

      {coverSrc ? (
        <img
          src={coverSrc}
          alt={book.title}
          className={cn(
            "absolute inset-0 size-full object-cover",
            imageClassName,
          )}
          loading="lazy"
          onLoad={handleImgLoad}
          onError={handleImgError}
        />
      ) : null}

      {showFallbackMeta ? (
        <div
          className={cn(
            "absolute inset-0 flex size-full flex-col items-center justify-center px-3 py-4 text-center transition-opacity duration-300",
            coverSrc && imgLoaded ? "pointer-events-none opacity-0" : "opacity-100",
            fallbackClassName,
          )}
        >
          {/* Bottom scrim to match the design's ::before overlay. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.15))",
            }}
          />
          <span
            className={cn(
              "relative z-10 line-clamp-3 text-base font-semibold leading-[1.4] text-ink-inverse [text-shadow:0_1px_4px_rgba(0,0,0,0.3)]",
              titleClassName,
            )}
          >
            {book.title}
          </span>
          {book.authors.length > 0 ? (
            <span className="relative z-10 mt-1.5 line-clamp-1 text-[11px] text-ink-inverse/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.2)]">
              {book.authors.join(", ")}
            </span>
          ) : null}
        </div>
      ) : null}

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