import type { BookAnchor } from "my-reader-tools/progress/BookAnchor";

import type { Library } from "./types";
import { getLibraryDatabase } from "./library-db";

const LOG_TARGET = "reading-progress";

function summarizeAnchor(a: BookAnchor): Record<string, unknown> {
  return {
    chapterIndex: a.chapterIndex,
    charOffset: a.charOffset ?? null,
    hasSnippet: Boolean(a.textSnippet),
    hasSnippetAfter: Boolean(a.textSnippetAfter),
  };
}

/**
 * 按书库 id、书籍 id、格式读取一条进度；format 大小写不敏感。
 */
export async function getReadingProgress(
  library: Library,
  bookId: number,
  format: string,
): Promise<BookAnchor | null> {
  const fmt = format.toUpperCase();
  console.info(
    `[${LOG_TARGET}] get:start`,
    { libraryId: library.id, bookId, format: fmt },
  );

  try {
    const db = getLibraryDatabase(library);
    const result = await db.execute(
      `SELECT anchor_json FROM reading_progress
       WHERE library_id = ? AND book_id = ? AND format = ?`,
      [library.id, bookId, fmt],
    );

    const row = result.rows[0] as { anchor_json: string } | undefined;
    if (!row) {
      console.info(`[${LOG_TARGET}] get:miss`, { libraryId: library.id, bookId, format: fmt });
      return null;
    }

    const anchor: BookAnchor = JSON.parse(row.anchor_json);
    console.info(`[${LOG_TARGET}] get:hit`, {
      libraryId: library.id,
      bookId,
      format: fmt,
      ...summarizeAnchor(anchor),
    });
    return anchor;
  } catch (e) {
    console.error(`[${LOG_TARGET}] get:error`, { libraryId: library.id, bookId, format: fmt, error: e });
    return null;
  }
}

/**
 * 保存或更新阅读进度。主键为 (library_id, book_id, format)。
 */
export async function setReadingProgress(
  library: Library,
  bookId: number,
  format: string,
  anchor: BookAnchor,
): Promise<void> {
  const fmt = format.toUpperCase();
  const updatedAt = Date.now();
  const json = JSON.stringify(anchor);

  console.info(`[${LOG_TARGET}] set:start`, {
    libraryId: library.id,
    bookId,
    format: fmt,
    updatedAt,
    ...summarizeAnchor(anchor),
  });

  try {
    const db = getLibraryDatabase(library);
    await db.execute(
      `INSERT OR REPLACE INTO reading_progress
       (library_id, book_id, format, anchor_json, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [library.id, bookId, fmt, json, updatedAt],
    );
    console.info(`[${LOG_TARGET}] set:ok`, { libraryId: library.id, bookId, format: fmt });
  } catch (e) {
    console.error(`[${LOG_TARGET}] set:error`, { libraryId: library.id, bookId, format: fmt, error: e });
  }
}
