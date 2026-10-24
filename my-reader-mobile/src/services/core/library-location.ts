import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import {
  libraryLocation,
  libraryRelocate,
  type RelocateLibraryRequest,
} from "my-reader-core"
import { appConfigFromCore, appConfigPath } from "./app-config"
import { credentialFor } from "./remote"
import { appErrorKind } from "@/src/errors/kind"
import { libraryRootUri, librarySidecarRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"
import { withSecurityScopedLibraryAccess } from "../fs/bookmarks"

export type { LibraryLocation } from "my-reader-core"

export async function readLibraryLocation(
  library: Library,
  source?: DataSource,
  diagnose = false,
) {
  const describe = () =>
    libraryLocation(
      appConfigPath,
      library.id,
      toNativeFilesystemPath(libraryRootUri(library)),
      undefined,
      false,
    )
  if (!diagnose) return describe()
  try {
    const credential = source ? await credentialFor(source) : undefined
    return await withSecurityScopedLibraryAccess(library, (uri) =>
      libraryLocation(
        appConfigPath,
        library.id,
        toNativeFilesystemPath(uri),
        credential,
        true,
      ),
    )
  } catch (error) {
    const location = await describe()
    const kind = appErrorKind(error)
    const problem =
      kind === "Network" ||
      kind === "Request" ||
      kind === "Storage" ||
      kind === "connectivity"
        ? "connectivity"
        : kind === "NotFound" || kind === "Config"
          ? "data_source"
          : "credential"
    return { ...location, problem, detail: String(error) }
  }
}

export async function relocateLibraryLocation(
  library: Library,
  target: RelocateLibraryRequest,
  source?: DataSource,
) {
  const credential = source ? await credentialFor(source) : undefined
  const candidate = {
    ...library,
    path: target.targetUri ?? target.targetPath,
    securityScopedBookmark: target.securityScopedBookmark,
  }
  const result = await withSecurityScopedLibraryAccess(candidate, (uri) =>
    libraryRelocate(
      appConfigPath,
      library.id,
      toNativeFilesystemPath(librarySidecarRootUri(library)),
      {
        ...target,
        targetPath: source ? target.targetPath : toNativeFilesystemPath(uri),
        targetUri: source ? target.targetUri : uri,
        securityScopedBookmark: target.securityScopedBookmark
          ? { ...target.securityScopedBookmark, resolvedUri: uri }
          : undefined,
      },
      credential,
    ),
  )
  return {
    location: result.location,
    config: result.config ? appConfigFromCore(result.config) : undefined,
  }
}
