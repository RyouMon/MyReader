import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

export const bookCoverThumbnailCache = sqliteTable(
  "book_cover_thumbnail_cache",
  {
    id: text("id").notNull().primaryKey(),
    bookId: integer("book_id").notNull(),
    coverIdentity: text("cover_identity").notNull(),
    thumbnailVersion: text("thumbnail_version").notNull(),
    widthPx: integer("width_px").notNull(),
    heightPx: integer("height_px").notNull(),
    fileName: text("file_name").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    createdAt: real("created_at").notNull(),
    updatedAt: real("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_book_cover_thumbnail_cache_book_size_version").on(
      t.bookId,
      t.widthPx,
      t.heightPx,
      t.thumbnailVersion,
    ),
  ],
)
