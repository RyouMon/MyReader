import { Directory, File } from "expo-file-system";
import { Platform } from "react-native";

import type { RemoteBackend } from "@/src/services/remote/backend";
import { ensureDocumentSubdirUri, fileUriFor, joinRelativePath } from "@/src/services/fs/path";
import type { BookItem, Library } from "../types";
import { isRemoteSourceType } from "../types";

export const COVER_FILE_NAME = "cover.jpg";
export const METADATA_DB_RELATIVE = "metadata.db";
export const LIBRARY_MYREADER_DIR = ".myreader";

const LIBRARIES_DOCUMENT_DIR = "libraries";

/** App container root for a library (`Documents/libraries/{id}/`). */
export function libraryContainerRootUri(libraryId: string): string {
  return ensureDocumentSubdirUri(LIBRARIES_DOCUMENT_DIR, libraryId);
}

/**
 * iOS local external: Calibre content is read via bookmark; sidecar lives in app container.
 */
export function usesIosContainerSidecar(library: Library): boolean {
  return (
    Platform.OS === "ios" &&
    !isRemoteSourceType(library.sourceType) &&
    Boolean(library.securityScopedBookmark)
  );
}

/** User-selected Calibre library root (bookmark or filesystem path). */
export function libraryLocalRootUri(library: Library): string {
  return library.securityScopedBookmark?.resolvedUri ?? library.path;
}

/**
 * Calibre tree root: metadata.db, books, covers.
 * Remote → container; local → {@link libraryLocalRootUri}.
 */
export function libraryRootUri(library: Library): string {
  if (isRemoteSourceType(library.sourceType)) {
    return libraryContainerRootUri(library.id);
  }
  return libraryLocalRootUri(library);
}

/**
 * Root whose `{root}/.myreader/` holds app sidecar data.
 * Remote / iOS external → container; other local → local root.
 */
export function librarySidecarRootUri(library: Library): string {
  if (isRemoteSourceType(library.sourceType) || usesIosContainerSidecar(library)) {
    return libraryContainerRootUri(library.id);
  }
  return libraryLocalRootUri(library);
}

/** `{libraryRoot}/metadata.db`. */
export function libraryMetadataUri(library: Library): string {
  return fileUriFor(libraryRootUri(library), METADATA_DB_RELATIVE);
}

/** `{sidecarRoot}/.myreader`. */
export function libraryMyReaderDirUri(library: Library): string {
  return fileUriFor(librarySidecarRootUri(library), LIBRARY_MYREADER_DIR);
}

/** `{libraryRoot}/{relativePath}` for Calibre book files and covers. */
export function libraryBookFileUri(library: Library, relativePath: string): string {
  return fileUriFor(libraryRootUri(library), relativePath);
}

/** Ensures `{sidecarRoot}/.myreader` exists for container-backed sidecars. */
export function ensureLibrarySidecarDirectory(library: Library): string {
  const sidecarRoot = librarySidecarRootUri(library);
  if (isRemoteSourceType(library.sourceType) || usesIosContainerSidecar(library)) {
    libraryContainerRootUri(library.id);
  }
  const dir = new Directory(fileUriFor(sidecarRoot, LIBRARY_MYREADER_DIR));
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  return dir.uri;
}

function hasLocalCoverFile(library: Library, bookPath: string): boolean {
  const relative = joinRelativePath(bookPath, COVER_FILE_NAME);
  const file = new File(libraryBookFileUri(library, relative));
  return file.exists && (file.size ?? 0) > 0;
}

/** Prefer on-disk cover under library root; fall back to remote URL when a backend is provided. */
export function resolveCoverUri(
  library: Library,
  bookPath: string | null,
  hasCover: boolean,
  backend?: RemoteBackend,
): BookItem["coverUri"] | undefined {
  if (!bookPath || !hasCover) return undefined;

  if (hasLocalCoverFile(library, bookPath)) {
    return libraryBookFileUri(library, joinRelativePath(bookPath, COVER_FILE_NAME));
  }

  if (!backend) return undefined;

  const relative = joinRelativePath(bookPath, COVER_FILE_NAME);
  const cachedHeaders = backend.getCachedAuthHeaders();
  return {
    uri: backend.contentUrl(relative),
    headers: cachedHeaders ?? undefined,
  };
}
