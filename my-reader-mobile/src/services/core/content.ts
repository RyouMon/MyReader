import type { Library } from "@my-reader/tools/types/library"
import { withLocalLibraryCalibreRoot } from "../fs/local-library-content"
import {
  contentClearCoverThumbnailCache,
  contentDeleteCoverThumbnailCache,
  contentDeleteFileState,
  contentFinalizeDownloadedFile,
  contentGetFileState,
  contentListCoverThumbnailCache,
  contentListFileStates,
  contentListReadingFormats,
  contentMarkFileRemoteOnly,
  contentSetReadingFormat,
  contentUpsertCoverThumbnailCache,
  contentUpsertFileState,
  type BookCoverThumbnailCache as CoreBookCoverThumbnailCache,
  type BookCoverThumbnailCachePatch as CoreBookCoverThumbnailCachePatch,
  type DownloadedFile as CoreDownloadedFile,
  type FileState as CoreFileState,
} from "my-reader-core"
import { librarySidecarRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"
import {
  invalidateBookReadingFormat,
  invalidateFileStates,
} from "../query/invalidate-table"

export type FileState = Omit<
  CoreFileState,
  "localBlake3" | "localSize" | "localMtime"
> & {
  localBlake3: string | null
  localSize: number | null
  localMtime: number | null
}

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

function fileStateFromCore(state: CoreFileState): FileState {
  return {
    ...state,
    localBlake3: state.localBlake3 ?? null,
    localSize: state.localSize ?? null,
    localMtime: state.localMtime ?? null,
  }
}

export async function listBookReadingFormats(
  library: Library,
): Promise<Record<string, string>> {
  const formats = await withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    contentListReadingFormats(
      sidecarRootPath(library),
      toNativeFilesystemPath(libraryRootUri),
    ),
  )
  return Object.fromEntries(
    formats.map(({ bookId, format }) => [bookId, format]),
  )
}

export async function setBookReadingFormat(
  library: Library,
  bookId: number,
  format: string | null,
): Promise<void> {
  await withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    contentSetReadingFormat(
      sidecarRootPath(library),
      toNativeFilesystemPath(libraryRootUri),
      bookId,
      format ?? undefined,
    ),
  )
  await invalidateBookReadingFormat(library.id)
}

export function getFileState(
  library: Library,
  path: string,
): Promise<FileState | null> {
  return contentGetFileState(sidecarRootPath(library), path).then((state) =>
    state ? fileStateFromCore(state) : null,
  )
}

export async function listFileStates(library: Library): Promise<FileState[]> {
  return (await contentListFileStates(sidecarRootPath(library))).map(
    fileStateFromCore,
  )
}

export async function upsertFileState(
  library: Library,
  path: string,
  update: FileStateUpdate,
): Promise<void> {
  await contentUpsertFileState(sidecarRootPath(library), path, {
    localState: update.localState,
    localBlake3: update.localBlake3 ?? undefined,
    localSize: update.localSize ?? undefined,
    localMtime: update.localMtime ?? undefined,
  })
  await invalidateFileStates(library.id)
}

export async function deleteFileState(
  library: Library,
  path: string,
): Promise<void> {
  await contentDeleteFileState(sidecarRootPath(library), path)
  await invalidateFileStates(library.id)
}

export async function finalizeDownloadedFile(
  library: Library,
  relativePath: string,
  localFileUri: string,
): Promise<DownloadedFile> {
  const downloaded = await contentFinalizeDownloadedFile(
    sidecarRootPath(library),
    relativePath,
    toNativeFilesystemPath(localFileUri),
  )
  await invalidateFileStates(library.id)
  return downloaded
}

export async function markFileRemoteOnly(
  library: Library,
  relativePath: string,
): Promise<void> {
  await contentMarkFileRemoteOnly(sidecarRootPath(library), relativePath)
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
  return contentListCoverThumbnailCache(
    sidecarRootPath(library),
    input.thumbnailVersion,
    input.widthPx,
    input.heightPx,
  )
}

export function upsertBookCoverThumbnailCache(
  library: Library,
  patch: BookCoverThumbnailCachePatch,
): Promise<void> {
  return contentUpsertCoverThumbnailCache(sidecarRootPath(library), patch)
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
  return contentDeleteCoverThumbnailCache(
    sidecarRootPath(library),
    input.bookId,
    input.thumbnailVersion,
    input.widthPx,
    input.heightPx,
  )
}

export function clearBookCoverThumbnailCache(library: Library): Promise<void> {
  return contentClearCoverThumbnailCache(sidecarRootPath(library))
}
