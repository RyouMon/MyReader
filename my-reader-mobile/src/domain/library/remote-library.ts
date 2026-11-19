import { coreErrorKind } from "@/src/services/core/error"
import { NetworkError } from "@/src/errors"
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
  resolveCoverUri?(
    library: Library,
    bookPath: string,
    hasCover: boolean,
  ): Promise<BookItem["coverUri"]>
}

export function normalizeCurrentPath(path: string | undefined) {
  const normalized = (path ?? "").trim()
  if (!normalized || normalized === "/") return "/"
  return normalized.startsWith("/") ? normalized : `/${normalized}`
}

export function isMissingMetadataDbError(error: unknown) {
  return (
    coreErrorKind(error) === "MetadataDbNotFound" ||
    (error instanceof NetworkError && error.statusCode === 404)
  )
}

// -- Factory --

function buildRemoteOps(backend: RemoteBackend): RemoteLibraryOps {
  return {
    buildCoverUri: (lib: Library, bookPath: string, hasCover: boolean) =>
      backend.contentUrl(bookPath)
        ? resolveCoverUri(lib, bookPath, hasCover, backend)
        : undefined,
    resolveCoverUri: async (lib, bookPath, hasCover) => {
      if (!bookPath || !hasCover) return undefined
      if (backend.contentUrl(bookPath)) {
        return resolveCoverUri(lib, bookPath, hasCover, backend)
      }
      const relative = `${bookPath.replace(/\/$/, "")}/cover.jpg`
      return (await backend.getContentUri?.(relative)) ?? undefined
    },
  }
}

export async function createRemoteOps(
  library: Library,
  dataSources: DataSource[],
): Promise<RemoteLibraryOps | null> {
  const source = dataSources.find(
    (d) =>
      d.id === library.dataSourceId &&
      (d.type === "webdav" ||
        d.type === "onedrive" ||
        d.type === "gdrive" ||
        d.type === "dropbox" ||
        d.type === "s3"),
  )
  if (!source) return null

  const backend = await createRemoteBackend(source, library)
  if (!backend) return null

  return buildRemoteOps(backend)
}
