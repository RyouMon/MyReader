import type { Library } from "@my-reader/tools/types/library"

import { getCalibreLibraryUuid } from "@/src/repos/calibre/library"
import {
  readLibrarySidecarLocalMeta,
  withLibrarySidecarSyncTransaction,
} from "@/src/repos/library-sidecar-sync"
import {
  libraryMetadataUri,
  METADATA_DB_RELATIVE,
} from "@/src/services/fs/library-paths"
import { fileUriFor } from "@/src/services/fs/path"
import { withLocalLibraryCalibreRoot } from "../../library/local-library-content"
import {
  ensureLibrarySidecarReplicaIdentity,
  type LibrarySidecarReplicaIdentity,
} from "./replica-identity"

export async function ensureLibrarySidecarIdentity(
  library: Library,
): Promise<LibrarySidecarReplicaIdentity> {
  const existing = await withLibrarySidecarSyncTransaction(
    library,
    readLibrarySidecarLocalMeta,
  )
  if (existing) {
    return ensureLibrarySidecarReplicaIdentity(library, existing.libraryUuid)
  }
  const libraryUuid = library.securityScopedBookmark
    ? await withLocalLibraryCalibreRoot(library, (rootUri) =>
        getCalibreLibraryUuid(
          library.metadataUri ?? fileUriFor(rootUri, METADATA_DB_RELATIVE),
        ),
      )
    : await getCalibreLibraryUuid(
        library.metadataUri ?? libraryMetadataUri(library),
      )
  return ensureLibrarySidecarReplicaIdentity(library, libraryUuid)
}
