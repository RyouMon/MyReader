export type SecurityScopedBookmarkInfo = {
  bookmarkBase64: string
  resolvedUri: string
  stale: boolean
}

export type ResolveBookmarkResult = {
  uri: string
  stale: boolean
}
