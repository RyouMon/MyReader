import { File as FSFile } from "expo-file-system"

import {
  libraryLocalRootUri,
  libraryRootUri,
  METADATA_DB_RELATIVE,
  usesIosContainerSidecar,
} from "@/src/services/fs/library-paths"
import { fileUriFor } from "@/src/services/fs/path"
import { withSecurityScopedLibraryAccess } from "../../services/fs/bookmarks"
import type { Library } from "../types"
import { isRemoteSourceType } from "../types"

/**
 * Runs an operation against the library's local Calibre content root.
 * Remote libraries resolve their current app-container cache instead of a persisted sandbox path.
 * On iOS external libraries, acquires security-scoped access to the bookmark path first.
 */
export async function withLocalLibraryCalibreRoot<T>(
  library: Library,
  operation: (calibreRootUri: string) => Promise<T>,
): Promise<T> {
  if (isRemoteSourceType(library.sourceType)) {
    return operation(libraryRootUri(library))
  }

  if (usesIosContainerSidecar(library)) {
    const { result } = await withSecurityScopedLibraryAccess(library, operation)
    return result
  }

  if (library.securityScopedBookmark) {
    const { result } = await withSecurityScopedLibraryAccess(library, operation)
    return result
  }

  return operation(libraryLocalRootUri(library))
}

/** Resolves metadata.db under a local library's Calibre root, or null if missing. */
export async function resolveLocalLibraryMetadataUri(
  library: Library,
): Promise<string | null> {
  if (isRemoteSourceType(library.sourceType)) {
    return null
  }

  try {
    return await withLocalLibraryCalibreRoot(
      library,
      async (calibreRootUri) => {
        const metadataUri = fileUriFor(calibreRootUri, METADATA_DB_RELATIVE)
        const file = new FSFile(metadataUri)
        if (!file.exists || (file.size ?? 0) <= 0) {
          return null
        }
        return metadataUri
      },
    )
  } catch {
    return null
  }
}
