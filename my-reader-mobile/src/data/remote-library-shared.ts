import { File as ExpoFile } from "expo-file-system";

import i18n from "@/src/i18n";

import { showAlertWithStatusBarRestore } from "../constants/alert-with-status-bar";
import { openDatabaseFromUri } from "../services/db/sqlite";
import type { BookItem, Library } from "./types";
import type { RemoteBackend } from "../services/remote/backend";

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

export type RawBookRow = {
  id: number;
  title: string | null;
  author_sort: string | null;
  authors: string | null;
  path: string | null;
  has_cover: number | null;
  timestamp: string | null;
};

export function splitConcat(value: string | null): string[] {
  return value ? value.split("||").filter(Boolean) : [];
}

// -- Shared composite functions using RemoteBackend --

export async function ensureMetadataCached(
  library: Library,
  backend: RemoteBackend,
): Promise<string | null> {
  const metadataPath = library.metadataUri;
  if (!metadataPath) {
    try {
      const remoteBase = backend.normalizePath(library.sourcePath ?? library.path);
      const metadataFile = await backend.downloadToCache(
        `${remoteBase}/metadata.db`,
        `${backend.kind}-${library.id}-metadata.db`,
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

  const existingMetadata = new ExpoFile(metadataPath);
  if (existingMetadata.exists) {
    return existingMetadata.uri;
  }

  try {
    const remoteBase = backend.normalizePath(library.sourcePath ?? library.path);
    const metadataFile = await backend.downloadToCache(
      `${remoteBase}/metadata.db`,
      `${backend.kind}-${library.id}-metadata.db`,
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
  backend: RemoteBackend,
): Promise<string | null> {
  try {
    const remoteBase = backend.normalizePath(library.sourcePath ?? library.path);
    const metadataFile = await backend.downloadToCache(
      `${remoteBase}/metadata.db`,
      `${backend.kind}-${library.id}-metadata.db`,
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
  backend: RemoteBackend,
  sourceId: string,
  sourceName: string,
  remoteLibraryPath: string,
): Promise<Library> {
  const normalizedPath = backend.normalizePath(remoteLibraryPath);
  const metadataFile = await backend.downloadToCache(
    `${normalizedPath}/metadata.db`,
    `${backend.kind}-${sourceId}-${Date.now()}-metadata.db`,
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
      sourceType: backend.kind,
      sourcePath: normalizedPath,
    };
  } finally {
    await db.closeAsync();
  }
}

export async function readBooks(
  library: Library,
  backend: RemoteBackend,
  buildCoverUri: (library: Library, bookPath: string, hasCover: boolean) => BookItem["coverUri"],
): Promise<{ books: BookItem[]; metadataUri: string }> {
  const metadataUri = await ensureMetadataCached(library, backend);
  if (!metadataUri) {
    return { books: [], metadataUri: library.metadataUri! };
  }
  const db = await openDatabaseFromUri(metadataUri);

  try {
    const rows = await db.getAllAsync<RawBookRow>(BOOKS_QUERY);

    const books = rows.map((row) => {
      const authors = splitConcat(row.authors);

      const coverUri =
        row.path && (row.has_cover ?? 0) !== 0
          ? buildCoverUri(library, row.path, true)
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
    });

    return { metadataUri, books };
  } finally {
    await db.closeAsync();
  }
}