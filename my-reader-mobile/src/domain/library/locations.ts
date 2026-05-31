import { File } from "expo-file-system";

import type { RemoteBackend } from "@/src/services/remote/backend";
import { ensureDocumentSubdirUri, fileUriFor, joinRelativePath } from "@/src/services/fs/path";
import type { BookItem, Library } from "../types";
import { isRemoteSourceType } from "../types";

export const COVER_FILE_NAME = "cover.jpg";
export const METADATA_DB_RELATIVE = "metadata.db";

const REMOTE_LIBRARY_CACHE_DIR = "libraries";

/** Single Calibre root URI for a library (local picker path or remote sync cache). */
export function libraryRootUri(library: Library): string {
  if (isRemoteSourceType(library.sourceType)) {
    return ensureDocumentSubdirUri(REMOTE_LIBRARY_CACHE_DIR, library.id);
  }
  return library.securityScopedBookmark?.resolvedUri ?? library.path;
}

function hasLocalCoverFile(library: Library, bookPath: string): boolean {
  const relative = joinRelativePath(bookPath, COVER_FILE_NAME);
  const file = new File(fileUriFor(libraryRootUri(library), relative));
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
    return fileUriFor(libraryRootUri(library), joinRelativePath(bookPath, COVER_FILE_NAME));
  }

  if (!backend) return undefined;

  const relative = joinRelativePath(bookPath, COVER_FILE_NAME);
  const cachedHeaders = backend.getCachedAuthHeaders();
  return {
    uri: backend.contentUrl(relative),
    headers: cachedHeaders ?? undefined,
  };
}
