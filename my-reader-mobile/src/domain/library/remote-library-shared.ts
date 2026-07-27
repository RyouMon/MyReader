import { File as ExpoFile } from "expo-file-system"

import i18n from "@/src/i18n"
import {
  libraryRootUri,
  libraryMetadataUri,
  METADATA_DB_RELATIVE,
} from "@/src/services/fs/library-paths"
import { listCalibreBooks } from "@/src/services/core/catalog"
import { showAlertWithStatusBarRestore } from "../../constants/alert-with-status-bar"
import type { RemoteBackend } from "../../services/remote/backend"
import type { BookItem, Library } from "../types"
import { mapListRowsToBookItems } from "./calibre"

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

  const rows = await listCalibreBooks(libraryRootUri(library))
  const books = mapListRowsToBookItems(library, rows, {
    buildCoverUri: buildCoverUriFn,
  })

  return { metadataUri, books }
}
