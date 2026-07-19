export const queryKeys = {
  bookCoverThumbnailCache: (
    libraryId?: string,
    widthPx?: number,
    heightPx?: number,
    thumbnailVersion?: string,
  ) =>
    [
      "book-cover-thumbnail-cache",
      libraryId,
      widthPx,
      heightPx,
      thumbnailVersion,
    ] as const,
  bookCoverThumbnailCacheProfiles: (
    libraryId?: string,
    sizeSignature?: string,
    thumbnailVersion?: string,
  ) =>
    [
      "book-cover-thumbnail-cache-profiles",
      libraryId,
      sizeSignature,
      thumbnailVersion,
    ] as const,
  favoriteBooks: (libraryId?: string) => ["favorite-books", libraryId] as const,
  bookReadingFormat: (libraryId?: string) =>
    ["book-reading-format", libraryId] as const,
  fileStates: (libraryId?: string) => ["file-states", libraryId] as const,
  bookFormats: (libraryId?: string, booksLength?: number) =>
    ["book-formats", libraryId, booksLength] as const,
  readingProgress: (libraryId?: string) =>
    ["reading-progress", libraryId] as const,
  readerBookmarksRoot: (libraryId?: string) =>
    ["reader-bookmarks", libraryId] as const,
  readerBookmarks: (libraryId?: string, bookId?: number, format?: string) =>
    ["reader-bookmarks", libraryId, bookId, format?.toUpperCase()] as const,
  readerAnnotations: (libraryId?: string, bookId?: number, format?: string) =>
    ["reader-annotations", libraryId, bookId, format?.toUpperCase()] as const,
  recentlyReadBooks: (libraryId?: string) =>
    ["recently-read-books", libraryId] as const,
}
