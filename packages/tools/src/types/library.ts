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
  securityScopedBookmark?: {
    bookmarkBase64: string
    resolvedUri: string
    stale: boolean
  }
}