const MAX_CACHED_COVER_OBJECT_URLS = 300

type CoverObjectUrlCacheEntry = {
  sourceUrl: string
  objectUrl: string
  lastUsedAt: number
}

const coverObjectUrlCache = new Map<string, CoverObjectUrlCacheEntry>()
const pendingCoverObjectUrlLoads = new Map<string, Promise<string>>()
let cacheGeneration = 0

export function getCoverObjectUrlCacheKey({
  libraryId,
  bookPath,
}: {
  libraryId: string
  bookPath: string
}) {
  return `${libraryId}:${bookPath}`
}

export function getCachedCoverObjectUrl(key: string) {
  const entry = coverObjectUrlCache.get(key)
  if (!entry) return null
  entry.lastUsedAt = Date.now()
  return entry.objectUrl
}

export async function loadCoverObjectUrl(key: string, sourceUrl: string) {
  const existing = coverObjectUrlCache.get(key)
  if (existing && existing.sourceUrl !== sourceUrl) {
    removeCachedCoverObjectUrl(key)
  }

  const cached = getCachedCoverObjectUrl(key)
  if (cached) return cached

  const pending = pendingCoverObjectUrlLoads.get(key)
  if (pending) return pending

  const loadGeneration = cacheGeneration
  const load = fetch(sourceUrl, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`COVER_FETCH_FAILED: ${response.status}`)
      }
      return response.blob()
    })
    .then((blob) => {
      if (loadGeneration !== cacheGeneration) {
        throw new Error("COVER_FETCH_STALE")
      }
      const objectUrl = URL.createObjectURL(blob)
      setCachedCoverObjectUrl(key, sourceUrl, objectUrl)
      return objectUrl
    })
    .finally(() => {
      if (pendingCoverObjectUrlLoads.get(key) === load) {
        pendingCoverObjectUrlLoads.delete(key)
      }
    })

  pendingCoverObjectUrlLoads.set(key, load)
  return load
}

export function removeCachedCoverObjectUrl(key: string) {
  const entry = coverObjectUrlCache.get(key)
  if (!entry) return false
  URL.revokeObjectURL(entry.objectUrl)
  return coverObjectUrlCache.delete(key)
}

export function resetCoverObjectUrlCache() {
  const hadEntries = coverObjectUrlCache.size > 0
  cacheGeneration += 1
  for (const entry of coverObjectUrlCache.values()) {
    URL.revokeObjectURL(entry.objectUrl)
  }
  coverObjectUrlCache.clear()
  pendingCoverObjectUrlLoads.clear()
  return hadEntries
}

function setCachedCoverObjectUrl(
  key: string,
  sourceUrl: string,
  objectUrl: string,
) {
  removeCachedCoverObjectUrl(key)
  coverObjectUrlCache.set(key, {
    sourceUrl,
    objectUrl,
    lastUsedAt: Date.now(),
  })
  evictOldestCoverObjectUrls()
}

function evictOldestCoverObjectUrls() {
  if (coverObjectUrlCache.size <= MAX_CACHED_COVER_OBJECT_URLS) return

  const entries = [...coverObjectUrlCache.entries()].sort(
    ([, a], [, b]) => a.lastUsedAt - b.lastUsedAt,
  )
  const removeCount = coverObjectUrlCache.size - MAX_CACHED_COVER_OBJECT_URLS
  for (const [key] of entries.slice(0, removeCount)) {
    removeCachedCoverObjectUrl(key)
  }
}
