import { queryClient } from "./query-client"
import { queryKeys } from "./query-keys"

export function cacheFileState<T extends { path: string }>(
  libraryId: string,
  state: T,
): void {
  queryClient.setQueryData<T[]>(
    queryKeys.fileStates(libraryId),
    (current = []) => [
      state,
      ...current.filter((candidate) => candidate.path !== state.path),
    ],
  )
}

export function invalidateFavoriteBooks(libraryId?: string) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.favoriteBooks(libraryId),
  })
}

export function invalidateBookReadingFormat(libraryId?: string) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.bookReadingFormat(libraryId),
  })
}

export function invalidateFileStates(libraryId?: string) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.fileStates(libraryId),
  })
}

export function invalidateReadingProgress(libraryId?: string) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.readingProgress(libraryId),
  })
}

export function invalidateReadingStatistics(libraryId?: string) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.readingStatisticsRoot(libraryId),
  })
}

export function invalidateReaderBookmarks(libraryId?: string) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.readerBookmarksRoot(libraryId),
  })
}

export function invalidateReaderAnnotations(libraryId?: string) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.readerAnnotationsRoot(libraryId),
  })
}

export function invalidateRecentlyReadBooks(libraryId?: string) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.recentlyReadBooks(libraryId),
  })
}
