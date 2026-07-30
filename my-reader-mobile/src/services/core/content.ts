import type { Library } from "@my-reader/tools/types/library"
import { withLocalLibraryCalibreRoot } from "@/src/domain/library/local-library-content"
import { librarySidecarRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"
import {
  invalidateBookReadingFormat,
  invalidateFileStates,
} from "../query/invalidate-table"
import type {
  BookCoverThumbnailCache as CoreBookCoverThumbnailCache,
  BookCoverThumbnailCachePatch as CoreBookCoverThumbnailCachePatch,
  DownloadedFile as CoreDownloadedFile,
  FileState as CoreFileState,
} from "./contract.generated"
import { invokeCoreAsync } from "./transport"

export type FileState = CoreFileState

export type FileStateUpdate = {
  localState: FileState["localState"]
  localBlake3?: string | null
  localSize?: number | null
  localMtime?: number | null
}

export type DownloadedFile = CoreDownloadedFile

export type BookCoverThumbnailCache = CoreBookCoverThumbnailCache

export type BookCoverThumbnailCachePatch = CoreBookCoverThumbnailCachePatch

function sidecarRootPath(library: Library): string {
  return toNativeFilesystemPath(librarySidecarRootUri(library))
}

export function listBookReadingFormats(
  library: Library,
): Promise<Record<string, string>> {
  return withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    invokeCoreAsync("content", "listReadingFormats", {
      sidecarRootPath: sidecarRootPath(library),
      libraryRootPath: toNativeFilesystemPath(libraryRootUri),
    }),
  )
}

export async function setBookReadingFormat(
  library: Library,
  bookId: number,
  format: string | null,
): Promise<void> {
  await withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    invokeCoreAsync("content", "setReadingFormat", {
      sidecarRootPath: sidecarRootPath(library),
      libraryRootPath: toNativeFilesystemPath(libraryRootUri),
      bookId,
      format,
    }),
  )
  await invalidateBookReadingFormat(library.id)
}

export function getFileState(
  library: Library,
  path: string,
): Promise<FileState | null> {
  return invokeCoreAsync("content", "getFileState", {
    sidecarRootPath: sidecarRootPath(library),
    path,
  })
}

export function listFileStates(library: Library): Promise<FileState[]> {
  return invokeCoreAsync("content", "listFileStates", {
    sidecarRootPath: sidecarRootPath(library),
  })
}

export async function upsertFileState(
  library: Library,
  path: string,
  update: FileStateUpdate,
): Promise<void> {
  await invokeCoreAsync("content", "upsertFileState", {
    sidecarRootPath: sidecarRootPath(library),
    path,
    update: {
      localState: update.localState,
      localBlake3: update.localBlake3 ?? null,
      localSize: update.localSize ?? null,
      localMtime: update.localMtime ?? null,
    },
  })
  await invalidateFileStates(library.id)
}

export async function deleteFileState(
  library: Library,
  path: string,
): Promise<void> {
  await invokeCoreAsync("content", "deleteFileState", {
    sidecarRootPath: sidecarRootPath(library),
    path,
  })
  await invalidateFileStates(library.id)
}

export async function finalizeDownloadedFile(
  library: Library,
  relativePath: string,
  localFileUri: string,
): Promise<DownloadedFile> {
  const downloaded = await invokeCoreAsync(
    "content",
    "finalizeDownloadedFile",
    {
      sidecarRootPath: sidecarRootPath(library),
      relativePath,
      localPath: toNativeFilesystemPath(localFileUri),
    },
  )
  await invalidateFileStates(library.id)
  return downloaded
}

export async function markFileRemoteOnly(
  library: Library,
  relativePath: string,
): Promise<void> {
  await invokeCoreAsync("content", "markFileRemoteOnly", {
    sidecarRootPath: sidecarRootPath(library),
    relativePath,
  })
  await invalidateFileStates(library.id)
}

export function listBookCoverThumbnailCache(
  library: Library,
  input: {
    thumbnailVersion: string
    widthPx: number
    heightPx: number
  },
): Promise<BookCoverThumbnailCache[]> {
  return invokeCoreAsync("content", "listCoverThumbnailCache", {
    sidecarRootPath: sidecarRootPath(library),
    thumbnailVersion: input.thumbnailVersion,
    widthPx: input.widthPx,
    heightPx: input.heightPx,
  })
}

export function upsertBookCoverThumbnailCache(
  library: Library,
  patch: BookCoverThumbnailCachePatch,
): Promise<void> {
  return invokeCoreAsync("content", "upsertCoverThumbnailCache", {
    sidecarRootPath: sidecarRootPath(library),
    patch,
  })
}

export function deleteBookCoverThumbnailCache(
  library: Library,
  input: {
    bookId: number
    thumbnailVersion: string
    widthPx: number
    heightPx: number
  },
): Promise<void> {
  return invokeCoreAsync("content", "deleteCoverThumbnailCache", {
    sidecarRootPath: sidecarRootPath(library),
    bookId: input.bookId,
    thumbnailVersion: input.thumbnailVersion,
    widthPx: input.widthPx,
    heightPx: input.heightPx,
  })
}

export function clearBookCoverThumbnailCache(library: Library): Promise<void> {
  return invokeCoreAsync("content", "clearCoverThumbnailCache", {
    sidecarRootPath: sidecarRootPath(library),
  })
}
