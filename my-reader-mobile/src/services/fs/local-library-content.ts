import {
  isRemoteLibrarySourceType,
  type Library,
} from "@my-reader/tools/types/library"
import { File as FSFile } from "expo-file-system"

import {
  libraryLocalRootUri,
  libraryRootUri,
  METADATA_DB_RELATIVE,
  usesIosContainerSidecar,
} from "./library-paths"
import { fileUriFor } from "./path"
import { withSecurityScopedLibraryAccess } from "./bookmarks"

/**
 * Runs an operation against the library's local Calibre content root.
 * Remote libraries resolve their current app-container cache instead of a persisted sandbox path.
 * On iOS external libraries, acquires security-scoped access to the bookmark path first.
 */
export async function withLocalLibraryCalibreRoot<T>(
  library: Library,
  operation: (calibreRootUri: string) => Promise<T>,
): Promise<T> {
  if (isRemoteLibrarySourceType(library.sourceType)) {
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
  if (isRemoteLibrarySourceType(library.sourceType)) {
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
