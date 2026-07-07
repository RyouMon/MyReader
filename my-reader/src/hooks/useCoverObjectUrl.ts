import { useEffect, useState } from "react"
import { buildCoverUrl } from "@/lib/cover"
import {
  getCachedCoverObjectUrl,
  getCoverObjectUrlCacheKey,
  loadCoverObjectUrl,
} from "@/lib/coverObjectUrlCache"

export function useCoverObjectUrl({
  libraryId,
  bookPath,
  enabled,
  reloadKey,
}: {
  libraryId: string | null
  bookPath: string
  enabled: boolean
  reloadKey?: number
}) {
  const coverCacheKey =
    enabled && libraryId
      ? getCoverObjectUrlCacheKey({ libraryId, bookPath })
      : null
  const coverSourceUrl =
    enabled && libraryId ? buildCoverUrl(libraryId, bookPath) : null
  const coverRequestKey = coverSourceUrl
    ? `${coverSourceUrl}\u0000${reloadKey ?? 0}`
    : null
  const [coverSrc, setCoverSrc] = useState<string | null>(() =>
    coverCacheKey ? getCachedCoverObjectUrl(coverCacheKey) : null,
  )
  const [coverLoadError, setCoverLoadError] = useState(false)

  useEffect(() => {
    setCoverLoadError(false)
    setCoverSrc(null)

    if (!coverSourceUrl || !coverCacheKey || !coverRequestKey) {
      return
    }

    const cached = getCachedCoverObjectUrl(coverCacheKey)
    if (cached) {
      setCoverSrc(cached)
      return
    }

    let cancelled = false
    loadCoverObjectUrl(coverCacheKey, coverSourceUrl)
      .then((objectUrl) => {
        if (cancelled) return
        setCoverSrc(objectUrl)
      })
      .catch(() => {
        if (cancelled) return
        setCoverLoadError(true)
        setCoverSrc(null)
      })

    return () => {
      cancelled = true
    }
  }, [coverCacheKey, coverRequestKey, coverSourceUrl])

  return {
    coverSrc,
    coverCacheKey,
    coverLoadError,
    coverLoading: Boolean(coverSourceUrl && !coverSrc && !coverLoadError),
  }
}
