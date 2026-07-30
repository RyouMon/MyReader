import type { Library } from "@my-reader/tools/types/library"
import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { withLocalLibraryCalibreRoot } from "@/src/domain/library/local-library-content"
import { librarySidecarRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"
import {
  invalidateBookReadingFormat,
  invalidateFileStates,
} from "../query/invalidate-table"

export type FileState = {
  id: string
  path: string
  localState: "present" | "remote_only" | "local_only" | "dirty_push"
  localBlake3: string | null
  localSize: number | null
  localMtime: number | null
  updatedAt: number
}

export type FileStateUpdate = {
  localState: FileState["localState"]
  localBlake3?: string | null
  localSize?: number | null
  localMtime?: number | null
}

export type DownloadedFile = {
  size: number
  mtimeMs: number
}

export type BookCoverThumbnailCache = {
  id: string
  bookId: number
  coverIdentity: string
  thumbnailVersion: string
  widthPx: number
  heightPx: number
  fileName: string
  fileSizeBytes: number
  createdAt: number
  updatedAt: number
}

export type BookCoverThumbnailCachePatch = {
  bookId: number
  coverIdentity: string
  thumbnailVersion: string
  widthPx: number
  heightPx: number
  fileName: string
  fileSizeBytes: number
}

function sidecarRootPath(library: Library): string {
  return toNativeFilesystemPath(librarySidecarRootUri(library))
}

export function listBookReadingFormats(
  library: Library,
): Promise<Record<string, string>> {
  return withLocalLibraryCalibreRoot(library, async (libraryRootUri) =>
    JSON.parse(
      await MyReaderRustComponents.listBookReadingFormats(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
      ),
    ),
  )
}

export async function setBookReadingFormat(
  library: Library,
  bookId: number,
  format: string | null,
): Promise<void> {
  await withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    MyReaderRustComponents.setBookReadingFormat(
      sidecarRootPath(library),
      toNativeFilesystemPath(libraryRootUri),
      bookId,
      format,
    ),
  )
  await invalidateBookReadingFormat(library.id)
}

export async function getFileState(
  library: Library,
  path: string,
): Promise<FileState | null> {
  return JSON.parse(
    await MyReaderRustComponents.getLibraryFileState(
      sidecarRootPath(library),
      path,
    ),
  )
}

export async function listFileStates(library: Library): Promise<FileState[]> {
  return JSON.parse(
    await MyReaderRustComponents.listLibraryFileStates(
      sidecarRootPath(library),
    ),
  )
}

export async function upsertFileState(
  library: Library,
  path: string,
  update: FileStateUpdate,
): Promise<void> {
  await MyReaderRustComponents.upsertLibraryFileState(
    sidecarRootPath(library),
    path,
    JSON.stringify({
      localState: update.localState,
      localBlake3: update.localBlake3 ?? null,
      localSize: update.localSize ?? null,
      localMtime: update.localMtime ?? null,
    }),
  )
  await invalidateFileStates(library.id)
}

export async function deleteFileState(
  library: Library,
  path: string,
): Promise<void> {
  await MyReaderRustComponents.deleteLibraryFileState(
    sidecarRootPath(library),
    path,
  )
  await invalidateFileStates(library.id)
}

export async function finalizeDownloadedFile(
  library: Library,
  relativePath: string,
  localFileUri: string,
): Promise<DownloadedFile> {
  const downloaded = JSON.parse(
    await MyReaderRustComponents.finalizeDownloadedFile(
      sidecarRootPath(library),
      relativePath,
      toNativeFilesystemPath(localFileUri),
    ),
  ) as DownloadedFile
  await invalidateFileStates(library.id)
  return downloaded
}

export async function markFileRemoteOnly(
  library: Library,
  relativePath: string,
): Promise<void> {
  await MyReaderRustComponents.markLibraryFileRemoteOnly(
    sidecarRootPath(library),
    relativePath,
  )
  await invalidateFileStates(library.id)
}

export async function listBookCoverThumbnailCache(
  library: Library,
  input: {
    thumbnailVersion: string
    widthPx: number
    heightPx: number
  },
): Promise<BookCoverThumbnailCache[]> {
  return JSON.parse(
    await MyReaderRustComponents.listBookCoverThumbnailCache(
      sidecarRootPath(library),
      input.thumbnailVersion,
      input.widthPx,
      input.heightPx,
    ),
  )
}

export function upsertBookCoverThumbnailCache(
  library: Library,
  patch: BookCoverThumbnailCachePatch,
): Promise<void> {
  return MyReaderRustComponents.upsertBookCoverThumbnailCache(
    sidecarRootPath(library),
    JSON.stringify(patch),
  )
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
  return MyReaderRustComponents.deleteBookCoverThumbnailCache(
    sidecarRootPath(library),
    input.bookId,
    input.thumbnailVersion,
    input.widthPx,
    input.heightPx,
  )
}

export function clearBookCoverThumbnailCache(library: Library): Promise<void> {
  return MyReaderRustComponents.clearBookCoverThumbnailCache(
    sidecarRootPath(library),
  )
}
