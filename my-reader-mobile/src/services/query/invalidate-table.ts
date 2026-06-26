import { queryClient } from "./query-client";
import { queryKeys } from "./query-keys";

export function invalidateFavoriteBooks(libraryId?: string) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.favoriteBooks(libraryId) });
}

export function invalidateBookReadingFormat(libraryId?: string) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.bookReadingFormat(libraryId) });
}

export function invalidateFileStates(libraryId?: string) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.fileStates(libraryId) });
}

export function invalidateReadingProgress(libraryId?: string) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.readingProgress(libraryId) });
}

export function invalidateRecentlyReadBooks(libraryId?: string) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.recentlyReadBooks(libraryId) });
}
