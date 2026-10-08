import { useCallback, useEffect, useSyncExternalStore } from "react"
import { useCoverObjectUrl } from "@/hooks/useCoverObjectUrl"
import {
  getCoverFailureKey,
  getCoverFailuresRevision,
  isBrokenCover,
  markBrokenCover,
  subscribeCoverFailures,
} from "@/lib/coverFailureCache"
import { removeCachedCoverObjectUrl } from "@/lib/coverObjectUrlCache"
import type { BookDetail } from "@/lib/tauri-api"

export function useBookDetailCover(
  book: BookDetail | null,
  activeLibraryId: string | null,
) {
  const coverFailuresRevision = useSyncExternalStore(
    subscribeCoverFailures,
    getCoverFailuresRevision,
    getCoverFailuresRevision,
  )

  const coverFailureKey =
    book && activeLibraryId
      ? getCoverFailureKey({
          libraryId: activeLibraryId,
          bookPath: book.path,
          kind: "expected",
        })
      : null
  const coverFailed =
    coverFailuresRevision >= 0 && coverFailureKey
      ? isBrokenCover(coverFailureKey)
      : false
  const {
    coverSrc,
    coverCacheKey: detailCoverCacheKey,
    coverLoadError,
  } = useCoverObjectUrl({
    libraryId: activeLibraryId,
    bookPath: book?.path ?? "",
    enabled: Boolean(book?.hasCover && activeLibraryId && !coverFailed),
    reloadKey: coverFailuresRevision,
  })

  const handleCoverError = useCallback(() => {
    if (detailCoverCacheKey) {
      removeCachedCoverObjectUrl(detailCoverCacheKey)
    }
    if (coverFailureKey) {
      markBrokenCover(coverFailureKey)
    }
  }, [coverFailureKey, detailCoverCacheKey])

  useEffect(() => {
    if (coverLoadError && coverFailureKey) {
      markBrokenCover(coverFailureKey)
    }
  }, [coverFailureKey, coverLoadError])

  return { coverSrc, handleCoverError }
}
