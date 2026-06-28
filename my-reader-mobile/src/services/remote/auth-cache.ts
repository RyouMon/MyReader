type CachedAuth = {
  headers: Record<string, string>
  expiresAt: number | null
}

const store = new Map<string, CachedAuth>()

function isFresh(entry: CachedAuth): boolean {
  if (entry.expiresAt === null) return true
  return Date.now() < entry.expiresAt
}

export function getCachedAuth(
  dataSourceId: string,
): Record<string, string> | null {
  const entry = store.get(dataSourceId)
  if (!entry) return null
  if (!isFresh(entry)) {
    store.delete(dataSourceId)
    return null
  }
  return entry.headers
}

export function setCachedAuth(
  dataSourceId: string,
  headers: Record<string, string>,
  expiresAt: number | null,
): void {
  store.set(dataSourceId, { headers, expiresAt })
}

export function invalidateCachedAuth(dataSourceId: string): void {
  store.delete(dataSourceId)
}

export function clearAuthCache(): void {
  store.clear()
}
