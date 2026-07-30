import type { Library } from "@my-reader/tools/types/library"

import { getCalibreLibraryUuid } from "@/src/repos/calibre/library"
import {
  libraryMetadataUri,
  METADATA_DB_RELATIVE,
} from "@/src/services/fs/library-paths"
import { fileUriFor } from "@/src/services/fs/path"
import { withLocalLibraryCalibreRoot } from "../../library/local-library-content"
import type { LibrarySidecarReplicaIdentity } from "./replica-identity"
import { ensureSyncDatabaseIdentity } from "./sync-database"

export async function ensureLibrarySidecarIdentity(
  library: Library,
): Promise<LibrarySidecarReplicaIdentity> {
  const libraryUuid = library.securityScopedBookmark
    ? await withLocalLibraryCalibreRoot(library, (rootUri) =>
        getCalibreLibraryUuid(
          library.metadataUri ?? fileUriFor(rootUri, METADATA_DB_RELATIVE),
        ),
      )
    : await getCalibreLibraryUuid(
        library.metadataUri ?? libraryMetadataUri(library),
      )
  return ensureSyncDatabaseIdentity(library, libraryUuid)
}
