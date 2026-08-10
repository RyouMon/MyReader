import {
  isRemoteLibrarySourceType,
  type Library,
} from "@my-reader/tools/types/library"
import { Directory, File } from "expo-file-system"
import type { RemoteBackend } from "@/src/services/remote/backend"
import {
  canonicalRelativePath,
  ensureDocumentSubdirUri,
  fileUriFor,
  joinRelativePath,
} from "./path"

export const COVER_FILE_NAME = "cover.jpg"
export const METADATA_DB_RELATIVE = "metadata.db"
export const LIBRARY_MYREADER_DIR = ".myreader"

const LIBRARIES_DOCUMENT_DIR = "libraries"

/** App container root for a library (`Documents/libraries/{id}/`). */
export function libraryContainerRootUri(libraryId: string): string {
  return ensureDocumentSubdirUri(LIBRARIES_DOCUMENT_DIR, libraryId)
}

/** App container parent for all library-owned data (`Documents/libraries/`). */
export function librariesContainerRootUri(): string {
  return ensureDocumentSubdirUri(LIBRARIES_DOCUMENT_DIR)
}

/** Content root: external iOS directory, or the current app container. */
export function libraryRootUri(library: Library): string {
  if (
    !isRemoteLibrarySourceType(library.sourceType) &&
    library.securityScopedBookmark
  ) {
    return library.securityScopedBookmark.resolvedUri
  }
  return libraryContainerRootUri(library.id)
}

/** Root whose `{root}/.myreader/` holds app sidecar data. */
export function librarySidecarRootUri(library: Library): string {
  return libraryContainerRootUri(library.id)
}

/** `{libraryRoot}/metadata.db`. */
export function libraryMetadataUri(library: Library): string {
  return fileUriFor(libraryRootUri(library), METADATA_DB_RELATIVE)
}

/** `{sidecarRoot}/.myreader`. */
export function libraryMyReaderDirUri(library: Library): string {
  return fileUriFor(librarySidecarRootUri(library), LIBRARY_MYREADER_DIR)
}

/** `{libraryRoot}/{relativePath}` for book files and covers. */
export function libraryBookFileUri(
  library: Library,
  relativePath: string,
): string {
  return fileUriFor(libraryRootUri(library), relativePath)
}

/** Ensures `{sidecarRoot}/.myreader` exists. */
export function ensureLibrarySidecarDirectory(library: Library): string {
  const sidecarRoot = librarySidecarRootUri(library)
  const dir = new Directory(fileUriFor(sidecarRoot, LIBRARY_MYREADER_DIR))
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true })
  }
  return dir.uri
}

function hasLocalCoverFile(library: Library, bookPath: string): boolean {
  const relative = joinRelativePath(bookPath, COVER_FILE_NAME)
  const file = new File(libraryBookFileUri(library, relative))
  return file.exists && (file.size ?? 0) > 0
}

/** Uses an available local cover first, then falls back to the remote backend URL. */
export function resolveCoverUri(
  library: Library,
  bookPath: string | null,
  hasCover: boolean,
  backend?: RemoteBackend,
): string | { uri: string; headers?: Record<string, string> } | undefined {
  if (!bookPath || !hasCover) return undefined

  if (hasLocalCoverFile(library, bookPath)) {
    return libraryBookFileUri(
      library,
      joinRelativePath(bookPath, COVER_FILE_NAME),
    )
  }

  if (!backend) return undefined

  const relative = canonicalRelativePath(
    joinRelativePath(bookPath, COVER_FILE_NAME),
  )
  const cachedHeaders = backend.getCachedAuthHeaders()
  const uri = backend.contentUrl(relative)
  return cachedHeaders ? { uri, headers: cachedHeaders } : uri
}
