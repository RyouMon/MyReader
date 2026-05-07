import type { BookAnchor } from "my-reader-tools/progress/BookAnchor";
import type { Locator } from "react-native-readium";

import type { ReadingProgressAnchor } from "../components/reader/types";
import type { Library } from "./types";
import { getLibraryDatabase } from "./library-db";

const LOG_TARGET = "reading-progress";

/** Returns true when the stored anchor is a Readium Locator (EPUB). */
export function isLocatorAnchor(anchor: ReadingProgressAnchor): anchor is Locator {
  return "href" in anchor && "type" in anchor;
}

function summarizeAnchor(a: ReadingProgressAnchor): Record<string, unknown> {
  if (isLocatorAnchor(a)) {
    return {
      href: a.href,
      progression: a.locations?.progression ?? null,
      position: a.locations?.position ?? null,
    };
  }
  return {
    chapterIndex: a.chapterIndex,
    charOffset: a.charOffset ?? null,
    hasSnippet: Boolean(a.textSnippet),
    hasSnippetAfter: Boolean(a.textSnippetAfter),
  };
}

/**
 * 按书籍 id、格式读取一条进度；format 大小写不敏感。
 * EPUB 格式返回 Readium Locator；PDF/CBZ 返回 BookAnchor。
 * DB 层统一存 opaque JSON 字符串，无协议变更。
 */
export async function getReadingProgress(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReadingProgressAnchor | null> {
  const fmt = format.toUpperCase();
  console.info(`[${LOG_TARGET}] get:start`, { bookId, format: fmt });

  try {
    const db = getLibraryDatabase(library);
    const result = await db.execute(
      `SELECT anchor_json FROM reading_progress WHERE book_id = ? AND format = ?`,
      [bookId, fmt],
    );

    const row = result.rows[0] as { anchor_json: string } | undefined;
    if (!row) {
      console.info(`[${LOG_TARGET}] get:miss`, { bookId, format: fmt });
      return null;
    }

    const anchor: ReadingProgressAnchor = JSON.parse(row.anchor_json);
    console.info(`[${LOG_TARGET}] get:hit`, { bookId, format: fmt, ...summarizeAnchor(anchor) });
    return anchor;
  } catch (e) {
    console.error(`[${LOG_TARGET}] get:error`, { bookId, format: fmt, error: e });
    return null;
  }
}

/**
 * 保存或更新阅读进度。主键为 (book_id, format)。
 * anchor_json 为 opaque JSON：EPUB 存 Locator，PDF/CBZ 存 BookAnchor。
 */
export async function setReadingProgress(
  library: Library,
  bookId: number,
  format: string,
  anchor: ReadingProgressAnchor,
): Promise<void> {
  const fmt = format.toUpperCase();
  const updatedAt = Date.now();
  const json = JSON.stringify(anchor);

  console.info(`[${LOG_TARGET}] set:start`, {
    bookId,
    format: fmt,
    updatedAt,
    ...summarizeAnchor(anchor),
  });

  try {
    const db = getLibraryDatabase(library);
    await db.execute(
      `INSERT OR REPLACE INTO reading_progress
       (book_id, format, anchor_json, updated_at)
       VALUES (?, ?, ?, ?)`,
      [bookId, fmt, json, updatedAt],
    );
    console.info(`[${LOG_TARGET}] set:ok`, { bookId, format: fmt });
  } catch (e) {
    console.error(`[${LOG_TARGET}] set:error`, { bookId, format: fmt, error: e });
  }
}
