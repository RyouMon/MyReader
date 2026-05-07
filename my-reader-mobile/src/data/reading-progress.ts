import type { Locator } from "react-native-readium";

import { parseStoredLocator } from "../components/reader/locator";
import type { Library } from "./types";
import { getLibraryDatabase } from "./library-db";

const LOG_TARGET = "reading-progress";

function summarizeLocator(locator: Locator): Record<string, unknown> {
  return {
    href: locator.href,
    type: locator.type,
    progression: locator.locations?.progression ?? null,
    position: locator.locations?.position ?? null,
  };
}

/** 按书籍 id、格式读取一条进度；format 大小写不敏感。 */
export async function getReadingProgress(
  library: Library,
  bookId: number,
  format: string,
): Promise<Locator | null> {
  const fmt = format.toUpperCase();
  console.info(`[${LOG_TARGET}] get:start`, { bookId, format: fmt });

  try {
    const db = getLibraryDatabase(library);
    const result = await db.execute(
      `SELECT locator_json FROM reading_progress WHERE book_id = ? AND format = ?`,
      [bookId, fmt],
    );

    const row = result.rows[0] as { locator_json: string } | undefined;
    if (!row) {
      console.info(`[${LOG_TARGET}] get:miss`, { bookId, format: fmt });
      return null;
    }

    const raw: unknown = JSON.parse(row.locator_json);
    const locator = parseStoredLocator(raw);
    if (locator) {
      console.info(`[${LOG_TARGET}] get:hit`, { bookId, format: fmt, ...summarizeLocator(locator) });
    } else {
      console.info(`[${LOG_TARGET}] get:unparseable`, { bookId, format: fmt });
    }
    return locator;
  } catch (e) {
    console.error(`[${LOG_TARGET}] get:error`, { bookId, format: fmt, error: e });
    return null;
  }
}

/** 保存或更新阅读进度，主键 (book_id, format)。持久化为 Readium Locator JSON。 */
export async function setReadingProgress(
  library: Library,
  bookId: number,
  format: string,
  locator: Locator,
): Promise<void> {
  const fmt = format.toUpperCase();
  const updatedAt = Date.now();
  const json = JSON.stringify(locator);

  console.info(`[${LOG_TARGET}] set:start`, {
    bookId,
    format: fmt,
    updatedAt,
    ...summarizeLocator(locator),
  });

  try {
    const db = getLibraryDatabase(library);
    await db.execute(
      `INSERT OR REPLACE INTO reading_progress
       (book_id, format, locator_json, updated_at)
       VALUES (?, ?, ?, ?)`,
      [bookId, fmt, json, updatedAt],
    );
    console.info(`[${LOG_TARGET}] set:ok`, { bookId, format: fmt });
  } catch (e) {
    console.error(`[${LOG_TARGET}] set:error`, { bookId, format: fmt, error: e });
  }
}
