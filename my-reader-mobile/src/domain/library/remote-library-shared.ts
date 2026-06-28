import { File as ExpoFile } from "expo-file-system"

import i18n from "@/src/i18n"

import { showAlertWithStatusBarRestore } from "../../constants/alert-with-status-bar"
import { countBooks, listBooksWithAuthors } from "../../repos/calibre/books"
import type { RemoteBackend } from "../../services/remote/backend"
import type { BookItem, Library } from "../types"
import { mapListRowsToBookItems } from "./calibre"
import {
  libraryContainerRootUri,
  libraryMetadataUri,
  METADATA_DB_RELATIVE,
} from "@/src/services/fs/library-paths"

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function metadataDbError(error: unknown): Error {
  const detail = describeError(error)
  return new Error(`${i18n.t("sync.cannotRedownloadMeta")}: ${detail}`, {
    cause: error,
  })
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
  })
}

async function ensureMetadataCached(
  library: Library,
  backend: RemoteBackend,
): Promise<string | null> {
  const metadataUri = libraryMetadataUri(library)
  const existingMetadata = new ExpoFile(metadataUri)
  if (existingMetadata.exists && (existingMetadata.size ?? 0) > 0) {
    return existingMetadata.uri
  }

  try {
    const metadataFile = await backend.downloadToUri(
      METADATA_DB_RELATIVE,
      metadataUri,
    )
    return metadataFile.uri
  } catch (error) {
    logMetadataDbFailure("ensureMetadataCached", library, backend, error)
    showAlertWithStatusBarRestore(
      i18n.t("sync.corruptedLibrary"),
      i18n.t("sync.corruptedLibraryMessage"),
      [{ text: i18n.t("common.gotIt") }],
    )
    return null
  }
}

export async function forceRefreshMetadata(
  library: Library,
  backend: RemoteBackend,
): Promise<string> {
  const metadataUri = libraryMetadataUri(library)
  try {
    const metadataFile = await backend.downloadToUri(
      METADATA_DB_RELATIVE,
      metadataUri,
    )
    return metadataFile.uri
  } catch (error) {
    logMetadataDbFailure("forceRefreshMetadata", library, backend, error)
    showAlertWithStatusBarRestore(
      i18n.t("sync.corruptedLibrary"),
      i18n.t("sync.corruptedLibraryRedownloadMessage"),
      [{ text: i18n.t("common.gotIt") }],
    )
    throw metadataDbError(error)
  }
}

export async function createLibraryFromPath(
  backend: RemoteBackend,
  sourceId: string,
  sourceName: string,
  remoteLibraryPath: string,
): Promise<Library> {
  const normalizedPath = backend.normalizePath(remoteLibraryPath)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  libraryContainerRootUri(id)
  const stubLibrary: Library = {
    id,
    name: normalizedPath.split("/").filter(Boolean).at(-1) ?? sourceName,
    path: normalizedPath,
    metadataUri: "",
    bookCount: 0,
    addedAt: Date.now(),
    dataSourceId: sourceId,
    sourceType: backend.kind,
    sourcePath: normalizedPath,
  }
  const metadataUri = libraryMetadataUri(stubLibrary)

  await backend.downloadToUri(`${normalizedPath}/metadata.db`, metadataUri)

  const bookCount = await countBooks(metadataUri)

  return {
    ...stubLibrary,
    metadataUri,
    bookCount,
  }
}

export async function readBooks(
  library: Library,
  backend: RemoteBackend,
  buildCoverUriFn: (
    library: Library,
    bookPath: string,
    hasCover: boolean,
  ) => BookItem["coverUri"],
): Promise<{ books: BookItem[]; metadataUri: string }> {
  const metadataUri = await ensureMetadataCached(library, backend)
  if (!metadataUri) {
    return { books: [], metadataUri: libraryMetadataUri(library) }
  }

  await backend.getAuthHeaders()

  const rows = await listBooksWithAuthors(metadataUri)
  const books = mapListRowsToBookItems(library, rows, {
    buildCoverUri: buildCoverUriFn,
  })

  return { metadataUri, books }
}
