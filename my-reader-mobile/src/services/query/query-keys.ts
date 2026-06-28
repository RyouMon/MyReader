export const queryKeys = {
  favoriteBooks: (libraryId?: string) => ["favorite-books", libraryId] as const,
  bookReadingFormat: (libraryId?: string) =>
    ["book-reading-format", libraryId] as const,
  fileStates: (libraryId?: string) => ["file-states", libraryId] as const,
  bookFormats: (libraryId?: string, booksLength?: number) =>
    ["book-formats", libraryId, booksLength] as const,
  readingProgress: (libraryId?: string) =>
    ["reading-progress", libraryId] as const,
  recentlyReadBooks: (libraryId?: string) =>
    ["recently-read-books", libraryId] as const,
}
