import { File } from "expo-file-system";

import type { DataSource } from "@my-reader/tools/types/data-source";
import {
  forceRefreshLibraryMetadata,
  readBookCountFromMetadata,
} from "../library/calibre";
import { createRemoteOps } from "../library/remote-library";
import { openDatabaseFromUri } from "../../services/db/sqlite";
import type { Library } from "../types";
import { isRemoteSourceType } from "../types";

import i18n from "@/src/i18n";
import { clearReaderCachesForBook } from "../../services/fs/cache";
import { evictLocalFileOfflineSafe } from "./actions";
import { diffBooks, type BookDiff, type BookSummary } from "./book-diff";
import { downloadLibraryFile } from "../download/download-service";

type RawBookSummaryRow = {
  id: number;
  path: string | null;
  has_cover: number | null;
  formats: string | null;
};

const SUMMARY_QUERY = `
  SELECT
    b.id,
    b.path,
    b.has_cover,
    (SELECT GROUP_CONCAT(UPPER(d.format), '||') FROM data d WHERE d.book = b.id) AS formats
  FROM books b
`;

async function readBookSummaries(metadataUri: string): Promise<BookSummary[]> {
  const db = await openDatabaseFromUri(metadataUri);
  try {
    const rows = await db.getAllAsync<RawBookSummaryRow>(SUMMARY_QUERY);
    return rows.map((row) => ({
      id: String(row.id),
      path: row.path ?? undefined,
      hasCover: (row.has_cover ?? 0) !== 0,
      formats: row.formats ? row.formats.split("||").filter(Boolean) : [],
    }));
  } finally {
    await db.closeAsync();
  }
}

export interface RefreshLibraryResult {
  diff: BookDiff;
  newBookCount: number;
  newLibrary: Library;
}

/**
 * Refreshes a library by re-downloading/re-copying metadata.db, diffing the
 * book list, cleaning up removed books' local files, and downloading covers
 * for new books.
 */
export async function refreshLibrary(
  library: Library,
  dataSources: DataSource[],
): Promise<RefreshLibraryResult> {

  // 1. Read old summaries from current cached metadata.db
  const oldMetadataUri = library.metadataUri;
  let oldSummaries: BookSummary[] = [];
  if (oldMetadataUri) {
    const oldFile = new File(oldMetadataUri);
    if (oldFile.exists) {
      oldSummaries = await readBookSummaries(oldMetadataUri);
    }
  }

  // 2. Force refresh metadata.db
  let newLibrary: Library;
  if (isRemoteSourceType(library.sourceType)) {
    const ops = await createRemoteOps(library, dataSources);
    if (!ops) {
      throw new Error(i18n.t("sync.cannotRedownloadMeta"));
    }
    const newMetadataUri = await ops.forceRefreshMetadata(library);
    if (!newMetadataUri) {
      throw new Error(i18n.t("sync.cannotRedownloadMeta"));
    }
    newLibrary = { ...library, metadataUri: newMetadataUri };
  } else {
    newLibrary = await forceRefreshLibraryMetadata(library);
  }

  // 3. Read new summaries
  const newSummaries = await readBookSummaries(newLibrary.metadataUri!);
  const newBookCount = await readBookCountFromMetadata(
    newLibrary.metadataUri!
  );
  newLibrary = { ...newLibrary, bookCount: newBookCount };

  // 4. Diff
  const diff = diffBooks(oldSummaries, newSummaries);

  // 5. Clean up removed books' files
  for (const book of diff.removed) {
    if (!book.path) continue;
    try {
      await evictLocalFileOfflineSafe(library, `${book.path}/cover.jpg`);
    } catch {}
    for (const format of book.formats) {
      try {
        await evictLocalFileOfflineSafe(
          library,
          `${book.path}/${format}.${format.toLowerCase()}`
        );
      } catch {}
    }
    clearReaderCachesForBook(library.id, book.id);
  }

  // 6. Download covers for added / modified books
  if (isRemoteSourceType(library.sourceType)) {
    for (const book of diff.added) {
      if (book.hasCover && book.path) {
        try {
          await downloadLibraryFile({
            libraryId: library.id,
            relativePath: `${book.path}/cover.jpg`,
            libraries: [library],
            dataSources,
          });
        } catch (e) {
          console.warn("Failed to download cover for new book:", {
            bookId: book.id,
            error: e,
          });
        }
      }
    }
    for (const { old: oldBook, new: newBook } of diff.modified) {
      if (newBook.hasCover && newBook.path) {
        if (oldBook.path && oldBook.path !== newBook.path) {
          try {
            await evictLocalFileOfflineSafe(
              library,
              `${oldBook.path}/cover.jpg`
            );
          } catch {}
        }
        if (!oldBook.hasCover || oldBook.path !== newBook.path) {
          try {
            await downloadLibraryFile({
              libraryId: library.id,
              relativePath: `${newBook.path}/cover.jpg`,
              libraries: [library],
              dataSources,
            });
          } catch (e) {
            console.warn("Failed to download cover for modified book:", {
              bookId: newBook.id,
              error: e,
            });
          }
        }
      }
    }
  }

  return { diff, newBookCount, newLibrary };
}