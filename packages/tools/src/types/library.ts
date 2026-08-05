export type LibraryType = "calibre" | "myreader"

export type Library = {
  id: string
  name: string
  path: string
  bookCount: number
  /** Missing on legacy persisted entries; legacy libraries are Calibre libraries. */
  libraryType?: LibraryType
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

export const LOCAL_LIBRARY_DATA_SOURCE_ID = "builtin-local-storage"

export function libraryTypeOf(
  library: Pick<Library, "libraryType">,
): LibraryType {
  return library.libraryType ?? "calibre"
}

export function isRemoteLibrarySourceType(sourceType?: string | null): boolean {
  return sourceType === "webdav" || sourceType === "onedrive"
}
