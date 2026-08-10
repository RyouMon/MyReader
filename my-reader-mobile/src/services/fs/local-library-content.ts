import type { Library } from "@my-reader/tools/types/library"
import { File } from "expo-file-system"

import { withSecurityScopedLibraryAccess } from "./bookmarks"
import { libraryRootUri, METADATA_DB_RELATIVE } from "./library-paths"
import { fileUriFor } from "./path"

/** Runs an operation against the current internal or authorized external root. */
export async function withLocalLibraryContentRoot<T>(
  library: Library,
  operation: (contentRootUri: string) => Promise<T>,
): Promise<T> {
  if (library.securityScopedBookmark) {
    return withSecurityScopedLibraryAccess(library, operation)
  }
  return operation(libraryRootUri(library))
}

/** Resolves metadata.db inside an iOS external Calibre library. */
export async function resolveLocalLibraryMetadataUri(
  library: Library,
): Promise<string | null> {
  try {
    return await withLocalLibraryContentRoot(
      library,
      async (contentRootUri) => {
        const uri = fileUriFor(contentRootUri, METADATA_DB_RELATIVE)
        const metadata = new File(uri)
        return metadata.exists && (metadata.size ?? 0) > 0 ? uri : null
      },
    )
  } catch {
    return null
  }
}
