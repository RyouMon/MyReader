import { File } from "expo-file-system";

import type { DataSource } from "@my-reader/tools/types/data-source";
import { countBooks, listBookSummaries } from "../../repos/calibre/books";
import { forceRefreshLibraryMetadata } from "../library/calibre";
import { createRemoteOps } from "../library/remote-library";
import type { Library } from "../types";
import { isRemoteSourceType } from "../types";

import i18n from "@/src/i18n";
import { clearReaderCachesForBook } from "../../services/fs/cache";
import { downloadLibraryFile } from "../download/download-service";
import { evictLocalFileOfflineSafe } from "./actions";
import { diffBooks, type BookDiff, type BookSummary } from "./book-diff";

function mapSummaries(
  rows: Awaited<ReturnType<typeof listBookSummaries>>,
): BookSummary[] {
  return rows.map((row) => ({
    id: String(row.id),
    path: row.path ?? undefined,
    hasCover: row.hasCover !== 0,
    formats: row.formats,
  }));
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
  const oldMetadataUri = library.metadataUri;
  let oldSummaries: BookSummary[] = [];
  if (oldMetadataUri) {
    const oldFile = new File(oldMetadataUri);
    if (oldFile.exists) {
      oldSummaries = mapSummaries(await listBookSummaries(oldMetadataUri));
    }
  }

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

  const newMetadataUri = newLibrary.metadataUri!;
  const newSummaries = mapSummaries(await listBookSummaries(newMetadataUri));
  const newBookCount = await countBooks(newMetadataUri);
  newLibrary = { ...newLibrary, bookCount: newBookCount };

  const diff = diffBooks(oldSummaries, newSummaries);

  for (const book of diff.removed) {
    if (!book.path) continue;
    try {
      await evictLocalFileOfflineSafe(library, `${book.path}/cover.jpg`);
    } catch {}
    for (const format of book.formats) {
      try {
        await evictLocalFileOfflineSafe(
          library,
          `${book.path}/${format}.${format.toLowerCase()}`,
        );
      } catch {}
    }
    clearReaderCachesForBook(library.id, book.id);
  }

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
            await evictLocalFileOfflineSafe(library, `${oldBook.path}/cover.jpg`);
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
