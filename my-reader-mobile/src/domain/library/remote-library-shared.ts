import { File as ExpoFile } from "expo-file-system";

import i18n from "@/src/i18n";

import { showAlertWithStatusBarRestore } from "../../constants/alert-with-status-bar";
import { countBooks, listBooksWithAuthors } from "../../repos/calibre/books";
import type { RemoteBackend } from "../../services/remote/backend";
import type { BookItem, Library } from "../types";
import { mapListRowsToBookItems } from "./calibre";

async function ensureMetadataCached(
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

  const bookCount = await countBooks(metadataFile.uri);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: normalizedPath.split("/").filter(Boolean).at(-1) ?? sourceName,
    path: normalizedPath,
    metadataUri: metadataFile.uri,
    bookCount,
    addedAt: Date.now(),
    dataSourceId: sourceId,
    sourceType: backend.kind,
    sourcePath: normalizedPath,
  };
}

export async function readBooks(
  library: Library,
  backend: RemoteBackend,
  buildCoverUriFn: (library: Library, bookPath: string, hasCover: boolean) => BookItem["coverUri"],
): Promise<{ books: BookItem[]; metadataUri: string }> {
  const metadataUri = await ensureMetadataCached(library, backend);
  if (!metadataUri) {
    return { books: [], metadataUri: library.metadataUri! };
  }

  const rows = await listBooksWithAuthors(metadataUri);
  const books = mapListRowsToBookItems(library, rows, { buildCoverUri: buildCoverUriFn });

  return { metadataUri, books };
}
