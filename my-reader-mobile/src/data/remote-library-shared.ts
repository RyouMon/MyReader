import { File } from "expo-file-system";

import i18n from "@/src/i18n";

import { showAlertWithStatusBarRestore } from "../constants/alert-with-status-bar";
import { openDatabaseFromUri } from "../services/db/sqlite";
import type { BookItem, Library } from "./types";

// -- Shared types (moved from onedrive.ts and webdav.ts) --

export type RawBookRow = {
  id: number;
  title: string | null;
  author_sort: string | null;
  authors: string | null;
  path: string | null;
  has_cover: number | null;
  timestamp: string | null;
};

// -- Shared constants --

export const BOOKS_QUERY = `
  SELECT
    b.id,
    b.title,
    b.author_sort,
    b.path,
    b.has_cover,
    b.timestamp,
    (
      SELECT GROUP_CONCAT(a.name, '||')
      FROM authors a
      JOIN books_authors_link bal ON a.id = bal.author
      WHERE bal.book = b.id
    ) AS authors
  FROM books b
  ORDER BY b.sort COLLATE NOCASE ASC
`;

// -- Shared pure functions --

export function splitConcat(value: string | null): string[] {
  return value ? value.split("||").filter(Boolean) : [];
}

// -- Backend adapter interface --

/** Backend-specific operations that differ between OneDrive and WebDAV. */
export type RemoteBackendAdapter = {
  cacheKeyPrefix: string;
  sourceType: "onedrive" | "webdav";
  normalizePath(path: string): string;
  downloadToCache(remotePath: string, localName: string): Promise<File>;
  buildCoverUri(
    library: Library,
    bookPath: string,
    hasCover: boolean,
  ): Promise<BookItem["coverUri"]>;
};

// -- Shared composite functions --

export async function ensureMetadataCached(
  library: Library,
  adapter: RemoteBackendAdapter,
): Promise<string | null> {
  const metadataPath = library.metadataUri;
  if (!metadataPath) {
    // metadataUri is missing — download from remote
    try {
      const remoteBase = adapter.normalizePath(library.sourcePath ?? library.path);
      const metadataFile = await adapter.downloadToCache(
        `${remoteBase}/metadata.db`,
        `${adapter.cacheKeyPrefix}-${library.id}-metadata.db`,
      );
      return metadataFile.uri;
    } catch {
      showAlertWithStatusBarRestore(
        i18n.t("sync.corruptedLibrary"),
        i18n.t("sync.corruptedLibraryMessage"),
        [{ text: i18n.t("common.gotIt") }],
      );
      return null;
    }
  }

  const existingMetadata = new File(metadataPath);
  if (existingMetadata.exists) {
    return existingMetadata.uri;
  }

  try {
    const remoteBase = adapter.normalizePath(library.sourcePath ?? library.path);
    const metadataFile = await adapter.downloadToCache(
      `${remoteBase}/metadata.db`,
      `${adapter.cacheKeyPrefix}-${library.id}-metadata.db`,
    );
    return metadataFile.uri;
  } catch {
    showAlertWithStatusBarRestore(
      i18n.t("sync.corruptedLibrary"),
      i18n.t("sync.corruptedLibraryMessage"),
      [{ text: i18n.t("common.gotIt") }],
    );
    return null;
  }
}

export async function forceRefreshMetadata(
  library: Library,
  adapter: RemoteBackendAdapter,
): Promise<string | null> {
  try {
    const remoteBase = adapter.normalizePath(library.sourcePath ?? library.path);
    const metadataFile = await adapter.downloadToCache(
      `${remoteBase}/metadata.db`,
      `${adapter.cacheKeyPrefix}-${library.id}-metadata.db`,
    );
    return metadataFile.uri;
  } catch {
    showAlertWithStatusBarRestore(
      i18n.t("sync.corruptedLibrary"),
      i18n.t("sync.corruptedLibraryRedownloadMessage"),
      [{ text: i18n.t("common.gotIt") }],
    );
    return null;
  }
}

export async function createLibraryFromPath(
  adapter: RemoteBackendAdapter,
  sourceId: string,
  sourceName: string,
  remoteLibraryPath: string,
): Promise<Library> {
  const normalizedPath = adapter.normalizePath(remoteLibraryPath);
  const metadataFile = await adapter.downloadToCache(
    `${normalizedPath}/metadata.db`,
    `${adapter.cacheKeyPrefix}-${sourceId}-${Date.now()}-metadata.db`,
  );

  const db = await openDatabaseFromUri(metadataFile.uri);

  try {
    const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM books");
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: normalizedPath.split("/").filter(Boolean).at(-1) ?? sourceName,
      path: normalizedPath,
      metadataUri: metadataFile.uri,
      bookCount: row ? Number(row.count) : 0,
      addedAt: Date.now(),
      dataSourceId: sourceId,
      sourceType: adapter.sourceType,
      sourcePath: normalizedPath,
    };
  } finally {
    await db.closeAsync();
  }
}

export async function readBooks(
  library: Library,
  adapter: RemoteBackendAdapter,
): Promise<{ books: BookItem[]; metadataUri: string }> {
  const metadataUri = await ensureMetadataCached(library, adapter);
  if (!metadataUri) {
    return { books: [], metadataUri: library.metadataUri! };
  }
  const db = await openDatabaseFromUri(metadataUri);

  try {
    const rows = await db.getAllAsync<RawBookRow>(BOOKS_QUERY);

    const books = await Promise.all(
      rows.map(async (row) => {
        const authors = splitConcat(row.authors);

        const coverUri =
          row.path && (row.has_cover ?? 0) !== 0
            ? await adapter.buildCoverUri(library, row.path, true)
            : undefined;

        return {
          id: `${row.id}`,
          calibreId: row.id,
          title: row.title || i18n.t("common.unnamedBook"),
          author: authors[0] || row.author_sort || i18n.t("common.unknownAuthor"),
          authors,
          path: row.path || undefined,
          hasCover: (row.has_cover ?? 0) !== 0,
          timestamp: row.timestamp,
          coverUri,
        } satisfies BookItem;
      }),
    );

    return { metadataUri, books };
  } finally {
    await db.closeAsync();
  }
}
