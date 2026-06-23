import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { bookReadingFormat, readingProgress, fileState, syncMeta } from "./schema";

export type BookReadingFormat = InferSelectModel<typeof bookReadingFormat>;
export type NewBookReadingFormat = InferInsertModel<typeof bookReadingFormat>;
export type ReadingProgress = InferSelectModel<typeof readingProgress>;
export type NewReadingProgress = InferInsertModel<typeof readingProgress>;
export type FileState = InferSelectModel<typeof fileState>;
export type NewFileState = InferInsertModel<typeof fileState>;
export type SyncMeta = InferSelectModel<typeof syncMeta>;
export type NewSyncMeta = InferInsertModel<typeof syncMeta>;