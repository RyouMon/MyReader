import { File as ExpoFile } from "expo-file-system";

import i18n from "@/src/i18n";

import { showAlertWithStatusBarRestore } from "../../constants/alert-with-status-bar";
import { countBooks, listBooksWithAuthors } from "../../repos/calibre/books";
import type { RemoteBackend } from "../../services/remote/backend";
import type { BookItem, Library } from "../types";
import { mapListRowsToBookItems } from "./calibre";
import { METADATA_DB_RELATIVE } from "./locations";

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function metadataDbError(error: unknown): Error {
  const detail = describeError(error);
  return new Error(`${i18n.t("sync.cannotRedownloadMeta")}: ${detail}`, { cause: error });
}

function logMetadataDbFailure(
  scope: string,
  library: Library,
  backend: RemoteBackend,
  error: unknown,
): void {
  console.error(`[remote-library] ${scope}:`, {
    libraryId: library.id,
    backendKind: backend.kind,
    libraryPath: library.sourcePath ?? library.path,
    relativePath: METADATA_DB_RELATIVE,
    downloadUrl: backend.contentUrl(METADATA_DB_RELATIVE),
    error,
  });
}

async function ensureMetadataCached(
  library: Library,
  backend: RemoteBackend,
): Promise<string | null> {
  const metadataPath = library.metadataUri;
  if (!metadataPath) {
    try {
      const metadataFile = await backend.downloadToCache(
        METADATA_DB_RELATIVE,
        `${backend.kind}-${library.id}-metadata.db`,
      );
      return metadataFile.uri;
    } catch (error) {
      logMetadataDbFailure("ensureMetadataCached (no metadataUri)", library, backend, error);
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
    const metadataFile = await backend.downloadToCache(
      METADATA_DB_RELATIVE,
      `${backend.kind}-${library.id}-metadata.db`,
    );
    return metadataFile.uri;
  } catch (error) {
    logMetadataDbFailure("ensureMetadataCached (cache missing)", library, backend, error);
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
): Promise<string> {
  try {
    const metadataFile = await backend.downloadToCache(
      METADATA_DB_RELATIVE,
      `${backend.kind}-${library.id}-metadata.db`,
    );
    return metadataFile.uri;
  } catch (error) {
    logMetadataDbFailure("forceRefreshMetadata", library, backend, error);
    showAlertWithStatusBarRestore(
      i18n.t("sync.corruptedLibrary"),
      i18n.t("sync.corruptedLibraryRedownloadMessage"),
      [{ text: i18n.t("common.gotIt") }],
    );
    throw metadataDbError(error);
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
