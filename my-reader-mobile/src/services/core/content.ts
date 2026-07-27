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
