import type { Library } from "@my-reader/tools/types/library"

import { getCalibreLibraryUuid } from "@/src/services/core/catalog"
import { withLocalLibraryCalibreRoot } from "../../library/local-library-content"
import type { LibrarySidecarReplicaIdentity } from "./replica-identity"
import { ensureSyncDatabaseIdentity } from "./sync-database"

export async function ensureLibrarySidecarIdentity(
  library: Library,
): Promise<LibrarySidecarReplicaIdentity> {
  const libraryUuid = await withLocalLibraryCalibreRoot(
    library,
    getCalibreLibraryUuid,
  )
  return ensureSyncDatabaseIdentity(library, libraryUuid)
}
