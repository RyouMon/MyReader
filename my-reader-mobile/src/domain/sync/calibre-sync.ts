import { File } from "expo-file-system";

import { countBooks, listBookSummaries } from "../../repos/calibre/books";
import { forceRefreshLibraryMetadata } from "../library/calibre";
import { fetchBooksForLibrary } from "../library/books-list";
import { forceRefreshMetadata } from "../library/remote-library-shared";
import { mirrorMissingCovers } from "../library/cover-mirror";
import type { Library } from "../types";
import { isRemoteSourceType } from "../types";
import { clearReaderCachesForBook } from "../../services/fs/cache";
import { downloadLibraryFile } from "../download/download-service";
import i18n from "@/src/i18n";
import { describeError } from "../../utils/common";

import { diffBooks, type BookDiff, type BookSummary } from "./book-diff";
import type { SyncTargetContext } from "./context";
import { evictLocalFileOfflineSafe } from "./transfer";
import type { CalibreSyncResult, SyncLibraryOptions } from "./types";
import { isRemoteBackend, type SyncBackend } from "./resolve";

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

async function statMetadataEtag(backend: SyncBackend): Promise<string | null> {
  if (isRemoteBackend(backend)) {
    const stat = await backend.statRemoteFile("metadata.db");
    if (!stat) return null;
    return stat.etag ?? `${stat.mtimeMs}-${stat.size}`;
  }
  const stat = await backend.statRemote("metadata.db");
  if (!stat.exists) return null;
  return `${stat.mtimeMs}-${stat.size}`;
}

async function materializeMetadata(
  ctx: SyncTargetContext,
  etag: string,
): Promise<Library> {
  const { library, backend } = ctx;

  if (isRemoteBackend(backend)) {
    const newMetadataUri = await forceRefreshMetadata(library, backend);
    return { ...library, metadataEtag: etag, metadataUri: newMetadataUri };
  }

  const refreshed = await forceRefreshLibraryMetadata(library);
  return { ...refreshed, metadataEtag: etag };
}

async function applyBookDiffCleanup(
  library: Library,
  dataSources: import("../types").DataSource[],
  diff: BookDiff,
): Promise<void> {
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

  if (!isRemoteSourceType(library.sourceType)) return;

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
        console.warn("Failed to download cover for new book:", { bookId: book.id, error: e });
      }
    }
  }

  for (const { old: oldBook, new: newBook } of diff.modified) {
    if (!newBook.hasCover || !newBook.path) continue;
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

/** Phase A — Calibre 同步：metadata.db stat → materialize → 书目 diff → 封面。 */
export async function syncCalibre(
  ctx: SyncTargetContext,
  dataSources: import("../types").DataSource[],
  options: Pick<SyncLibraryOptions, "forceCalibre">,
  getBooks?: (libraryId: string) => import("../types").BookItem[],
): Promise<CalibreSyncResult> {
  const { library } = ctx;
  const forceCalibre = options.forceCalibre ?? false;

  try {
    const etag = await statMetadataEtag(ctx.backend);
    if (!etag && !forceCalibre) {
      return {
        skipped: true,
        skipReason: "unchanged",
        changed: false,
        library,
      };
    }

    const unchanged =
      !forceCalibre &&
      etag !== null &&
      library.metadataEtag &&
      library.metadataEtag === etag;

    if (unchanged) {
      return {
        skipped: true,
        skipReason: "unchanged",
        changed: false,
        library: etag ? { ...library, metadataEtag: etag } : library,
      };
    }

    const oldMetadataUri = library.metadataUri;
    let oldSummaries: BookSummary[] = [];
    if (oldMetadataUri) {
      const oldFile = new File(oldMetadataUri);
      if (oldFile.exists) {
        oldSummaries = mapSummaries(await listBookSummaries(oldMetadataUri));
      }
    }

    const nextEtag = etag ?? library.metadataEtag ?? "";
    let newLibrary = await materializeMetadata(ctx, nextEtag);

    const newMetadataUri = newLibrary.metadataUri;
    if (!newMetadataUri) {
      throw new Error(i18n.t("sync.cannotRedownloadMeta"));
    }

    const newSummaries = mapSummaries(await listBookSummaries(newMetadataUri));
    const newBookCount = await countBooks(newMetadataUri);
    newLibrary = { ...newLibrary, bookCount: newBookCount };

    const diff = diffBooks(oldSummaries, newSummaries);
    await applyBookDiffCleanup(newLibrary, dataSources, diff);

    const books = await fetchBooksForLibrary(newLibrary, dataSources);

    if (isRemoteSourceType(newLibrary.sourceType)) {
      const sourceBooks = getBooks?.(newLibrary.id) ?? books;
      void mirrorMissingCovers(newLibrary, dataSources, sourceBooks).catch(() => {});
    }

    return {
      skipped: false,
      changed: true,
      library: newLibrary,
      books,
      diff,
    };
  } catch (err) {
    return {
      skipped: true,
      skipReason: "error",
      changed: false,
      library,
      error: describeError(err),
    };
  }
}

export function skippedCalibre(library: Library): CalibreSyncResult {
  return {
    skipped: true,
    skipReason: "not_applicable",
    changed: false,
    library,
  };
}
