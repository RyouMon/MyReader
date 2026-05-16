/**
 * 跨端书库：统一 Store 中的书库类型与行为。
 */

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

export type LibraryStore = {
  libraries: Library[]
  activeLibraryId: string | null
  loading: boolean
  hydrated: boolean
  books: unknown[]
  loadingBooks: boolean
  error: string | null
  setHydrated: (value: boolean) => void
  hydrateFromBackend: () => Promise<void>
  refreshLibraries: () => Promise<void>
  refreshLibrary: (id: string) => Promise<void>
  refreshBooks: () => Promise<void>
  addLibrary: (path?: string, name?: string) => Promise<Library | null>
  addWebdavLibrary: (dataSourceId?: string, remotePath?: string, name?: string) => Promise<Library | null>
  addResolvedLibrary: (library: Library) => Promise<boolean>
  removeLibrary: (id: string) => Promise<void>
  switchLibrary: (id: string) => Promise<void>
  clearError: () => void
}
