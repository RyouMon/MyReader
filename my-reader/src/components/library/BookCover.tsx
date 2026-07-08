import type { CalibreBook } from "@my-reader/tools/types/book"
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useCoverObjectUrl } from "@/hooks/useCoverObjectUrl"
import { generateCoverGradient } from "@/lib/cover-gradient"
import {
  getCoverFailureKey,
  getCoverFailuresRevision,
  isBrokenCover,
  markBrokenCover,
  resetBrokenCovers,
  subscribeCoverFailures,
} from "@/lib/coverFailureCache"
import { removeCachedCoverObjectUrl } from "@/lib/coverObjectUrlCache"
import type { BookProgressSnapshot } from "@/lib/readingProgress"
import { cn } from "@/lib/utils"

export type { BookProgressSnapshot }
export { resetBrokenCovers }

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
  cornerIndicator?: ReactNode
  showSpine?: boolean
  /** Show title/author on the generated fallback cover. Defaults to true. */
  showFallbackMeta?: boolean
  /** Keep generated fallback text hidden while a real cover is still loading. */
  deferFallbackMetaUntilError?: boolean
  /** Try loading a cover even when Calibre metadata has not confirmed one yet. */
  probeCoverWhenUnknown?: boolean
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
  cornerIndicator,
  showSpine = true,
  showFallbackMeta = true,
  deferFallbackMetaUntilError = false,
  probeCoverWhenUnknown = false,
}: BookCoverProps) {
  const coverFailureKey = getCoverFailureKey({
    libraryId,
    bookPath: book.path,
    kind: book.hasCover ? "expected" : "probe",
  })
  const coverFailuresRevision = useSyncExternalStore(
    subscribeCoverFailures,
    getCoverFailuresRevision,
    getCoverFailuresRevision,
  )
  const imgFailed = isBrokenCover(coverFailureKey)
  const [loadedCoverSrc, setLoadedCoverSrc] = useState<string | null>(null)
  const hasExpectedCover = book.hasCover && !!libraryId
  const shouldProbeCover = probeCoverWhenUnknown && !!libraryId && !!book.path
  const shouldLoadCover = (hasExpectedCover || shouldProbeCover) && !imgFailed
  const { coverSrc, coverCacheKey, coverLoadError, coverLoading } =
    useCoverObjectUrl({
      libraryId,
      bookPath: book.path,
      enabled: shouldLoadCover,
      reloadKey: coverFailuresRevision,
    })
  const imgLoaded = !!coverSrc && loadedCoverSrc === coverSrc
  const showLoadingSkeleton =
    (coverLoading || (!!coverSrc && !imgLoaded)) && !imgFailed
  const showFallbackCover =
    (!hasExpectedCover && !shouldProbeCover) || imgFailed
  const showFallbackMetaContent =
    showFallbackCover &&
    showFallbackMeta &&
    (!deferFallbackMetaUntilError || imgFailed || !hasExpectedCover)
  const progressPercent =
    typeof progress?.percent === "number"
      ? Math.max(0, Math.min(100, progress.percent))
      : undefined

  const handleImgLoad = useCallback(() => {
    if (coverSrc) {
      setLoadedCoverSrc(coverSrc)
    }
  }, [coverSrc])

  const handleImgError = useCallback(() => {
    if (coverCacheKey) {
      removeCachedCoverObjectUrl(coverCacheKey)
    }
    markBrokenCover(coverFailureKey)
    setLoadedCoverSrc(null)
  }, [coverCacheKey, coverFailureKey])

  useEffect(() => {
    if (coverLoadError) {
      markBrokenCover(coverFailureKey)
    }
  }, [coverFailureKey, coverLoadError])

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-muted shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {showFallbackCover ? (
        <div
          className="absolute inset-0"
          style={{ background: generateCoverGradient(book.title) }}
          aria-hidden="true"
        />
      ) : null}

      {coverSrc ? (
        <img
          src={coverSrc}
          alt={book.title}
          className={cn(
            "absolute inset-0 size-full object-cover opacity-100 transition-opacity duration-150",
            showLoadingSkeleton && "opacity-0",
            imageClassName,
          )}
          loading="lazy"
          onLoad={handleImgLoad}
          onError={handleImgError}
        />
      ) : null}

      {showLoadingSkeleton ? (
        <Skeleton
          className="absolute inset-0 z-10 size-full rounded-none"
          aria-hidden="true"
        />
      ) : null}

      {showFallbackMetaContent ? (
        <div
          className={cn(
            "absolute inset-0 flex size-full flex-col items-center justify-center px-3 py-4 text-center transition-opacity duration-300",
            fallbackClassName,
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-60% to-[var(--cover-scrim-rest)]" />
          <span
            className={cn(
              "relative z-10 line-clamp-3 text-base font-semibold leading-[1.4] text-cover-fg [text-shadow:0_1px_4px_rgba(0,0,0,0.3)]",
              titleClassName,
            )}
          >
            {book.title}
          </span>
          {book.authors.length > 0 ? (
            <span className="relative z-10 mt-1.5 line-clamp-1 text-[11px] text-cover-muted [text-shadow:0_1px_2px_rgba(0,0,0,0.2)]">
              {book.authors.join(", ")}
            </span>
          ) : null}
        </div>
      ) : null}

      {showSpine ? (
        <div
          className={cn(
            "absolute inset-y-0 start-0 w-1.5 bg-black/20",
            spineClassName,
          )}
        />
      ) : null}

      {cornerIndicator ? (
        <div className="absolute end-1.5 top-1.5 z-20">{cornerIndicator}</div>
      ) : null}

      {showProgress && typeof progressPercent === "number" ? (
        <Progress
          value={progressPercent}
          className="absolute inset-x-0 bottom-0 h-0.5 rounded-none bg-ink-inverse/20 [&_[data-slot=progress-indicator]]:bg-ink-inverse/75"
        />
      ) : null}
    </div>
  )
})
