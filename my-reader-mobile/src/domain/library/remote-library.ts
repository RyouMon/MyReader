import { resolveCoverUri } from "@/src/services/fs/library-paths"
import type { RemoteBackend } from "../../services/remote/backend"
import { createRemoteBackend } from "../../services/remote/factory"
import type { BookItem, DataSource, Library } from "../types"

export type RemoteLibraryOps = {
  buildCoverUri(
    library: Library,
    bookPath: string,
    hasCover: boolean,
  ): BookItem["coverUri"]
}

export function normalizeCurrentPath(path: string | undefined) {
  const normalized = (path ?? "").trim()
  if (!normalized || normalized === "/") return "/"
  return normalized.startsWith("/") ? normalized : `/${normalized}`
}

export function isMissingMetadataDbError(error: unknown) {
  return (
    error instanceof Error &&
    /404|WEBDAV_NOT_FOUND|ONEDRIVE_NOT_FOUND/.test(error.message)
  )
}

// -- Factory --

function buildRemoteOps(backend: RemoteBackend): RemoteLibraryOps {
  return {
    buildCoverUri: (lib: Library, bookPath: string, hasCover: boolean) =>
      resolveCoverUri(lib, bookPath, hasCover, backend),
  }
}

export async function createRemoteOps(
  library: Library,
  dataSources: DataSource[],
): Promise<RemoteLibraryOps | null> {
  const source = dataSources.find(
    (d) =>
      d.id === library.dataSourceId &&
      (d.type === "webdav" || d.type === "onedrive"),
  )
  if (!source) return null

  const backend = await createRemoteBackend(source, library)
  if (!backend) return null

  return buildRemoteOps(backend)
}
