import type { Locator } from "@my-reader/readium";

import {
  getReadingProgressRow,
  upsertReadingProgress,
} from "../repos/reading_progress";
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
    const row = await getReadingProgressRow(library, bookId, fmt);
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

  try {
    await upsertReadingProgress(library, {
      bookId,
      format: fmt,
      locatorJson,
      updatedAt,
    });
  } catch (e) {
    console.error("[reading-progress] set:error", { bookId, format: fmt, error: e });
  }
}
