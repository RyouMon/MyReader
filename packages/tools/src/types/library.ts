export type Library = {
  id: string
  name: string
  path: string
  bookCount: number
  metadataUri?: string
  addedAt?: number
  dataSourceId?: string | null
  sourceType?: string | null
  sourcePath?: string | null
  /** ETag/cTag of metadata.db on remote. Used for incremental detection. */
  metadataEtag?: string | null
  securityScopedBookmark?: {
    bookmarkBase64: string
    resolvedUri: string
    stale: boolean
  }
}