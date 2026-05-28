import type { Locator } from "@ryoumon/react-native-readium";
import { and, eq } from "drizzle-orm";

import { uuid } from "@/src/utils/common";
import { readingProgress } from "@my-reader/db/schema";
import { getLibraryDatabase } from "../services/db/library-db";
import type { Library } from "./types";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseStoredLocator(raw: unknown): Locator | null {
  if (!isPlainObject(raw)) return null;
  const { href, type } = raw;
  if (typeof href !== "string" || href.length === 0) return null;
  if (typeof type !== "string" || type.length === 0) return null;
  return raw as unknown as Locator;
}

/**
 * Strip platform-specific prefix from href for cross-platform storage.
 * Desktop CBZ/PDF hrefs contain `asset://localhost/<extracted-dir>/` which
 * is invalid on mobile. We keep only the relative path suffix.
 */
function normalizeHrefForStorage(href: string): string {
  if (!href.startsWith("asset://localhost/")) return href;
  try {
    const url = new URL(href);
    const decoded = decodeURIComponent(url.pathname);
    const match = decoded.match(/\/extracted\/[^/]+\//);
    if (match) {
      const relativePath = decoded.slice((match.index ?? 0) + match[0].length);
      if (relativePath) return relativePath;
    }
  } catch {
    // URL parsing failed — return as-is
  }
  return href;
}

/** Read reading progress by book id and format (case-insensitive). */
export async function getReadingProgress(
  library: Library,
  bookId: number,
  format: string,
): Promise<Locator | null> {
  const fmt = format.toUpperCase();

  try {
    const { db } = await getLibraryDatabase(library);
    const rows = await db
      .select()
      .from(readingProgress)
      .where(
        and(
          eq(readingProgress.bookId, bookId),
          eq(readingProgress.format, fmt),
        ),
      );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const raw: unknown = JSON.parse(row.locatorJson);
    return parseStoredLocator(raw);
  } catch (e) {
    console.error("[reading-progress] get:error", { bookId, format: fmt, error: e });
    return null;
  }
}

/** Save or update reading progress. Uses UUID4 id as primary key. */
export async function setReadingProgress(
  library: Library,
  bookId: number,
  format: string,
  locator: Locator,
): Promise<void> {
  const fmt = format.toUpperCase();
  const updatedAt = Date.now();
  const normalized: Locator = {
    ...locator,
    href: normalizeHrefForStorage(locator.href),
  };
  const locatorJson = JSON.stringify(normalized);
  const id = uuid();

  try {
    const { db } = await getLibraryDatabase(library);
    await db
      .insert(readingProgress)
      .values({ id, bookId, format: fmt, locatorJson, updatedAt })
      .onConflictDoUpdate({
        target: [readingProgress.bookId, readingProgress.format],
        set: { locatorJson, updatedAt },
      });
  } catch (e) {
    console.error("[reading-progress] set:error", { bookId, format: fmt, error: e });
  }
}