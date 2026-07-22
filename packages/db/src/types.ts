import type { InferInsertModel, InferSelectModel } from "drizzle-orm"
import type {
  annotations,
  bookCoverThumbnailCache,
  bookmarks,
  bookReadingFormat,
  favoriteBooks,
  fileState,
  readingCompletions,
  readingProgress,
  readingSessions,
  syncMeta,
} from "./schema"

export type Annotation = InferSelectModel<typeof annotations>
export type NewAnnotation = InferInsertModel<typeof annotations>
export type BookCoverThumbnailCache = InferSelectModel<
  typeof bookCoverThumbnailCache
>
export type NewBookCoverThumbnailCache = InferInsertModel<
  typeof bookCoverThumbnailCache
>
export type BookReadingFormat = InferSelectModel<typeof bookReadingFormat>
export type NewBookReadingFormat = InferInsertModel<typeof bookReadingFormat>
export type Bookmark = InferSelectModel<typeof bookmarks>
export type NewBookmark = InferInsertModel<typeof bookmarks>
export type FavoriteBook = InferSelectModel<typeof favoriteBooks>
export type NewFavoriteBook = InferInsertModel<typeof favoriteBooks>
export type ReadingProgress = InferSelectModel<typeof readingProgress>
export type NewReadingProgress = InferInsertModel<typeof readingProgress>
export type ReadingSession = InferSelectModel<typeof readingSessions>
export type NewReadingSession = InferInsertModel<typeof readingSessions>
export type ReadingCompletion = InferSelectModel<typeof readingCompletions>
export type NewReadingCompletion = InferInsertModel<typeof readingCompletions>
export type FileState = InferSelectModel<typeof fileState>
export type NewFileState = InferInsertModel<typeof fileState>
export type SyncMeta = InferSelectModel<typeof syncMeta>
export type NewSyncMeta = InferInsertModel<typeof syncMeta>
