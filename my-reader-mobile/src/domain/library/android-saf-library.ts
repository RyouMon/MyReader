import { Directory, File, Paths } from "expo-file-system"
import { Platform } from "react-native"

import { libraryTypeOf, type Library } from "@my-reader/tools/types/library"
import {
  getFileState,
  installVerifiedDownloadedFile,
  markFileSourceMissing,
} from "@/src/services/core/content"
import { getMyreaderBookContent } from "@/src/services/core/catalog"
import {
  childDirectory,
  copyFileFromTree,
  copyFileIntoTree,
  deleteDirectoryAtPath,
  ensureDirectoryPath,
  fileExistsAtPath,
  isAndroidSafUri,
  listChildDirectories,
  mergeDirectoryTree,
} from "@/src/services/fs/android-saf"
import {
  LIBRARY_MYREADER_DIR,
  libraryBookFileUri,
  librarySidecarRootUri,
} from "@/src/services/fs/library-paths"
import { uuid } from "@/src/utils/common"
import {
  isManagedBookDirectoryName,
  managedBookDirectory,
} from "./android-saf-paths"

const SAF_MIRRORS_DIR = "saf-library-mirrors"
export function isAndroidSafLibrary(library: Library): boolean {
  return (
    Platform.OS === "android" &&
    libraryTypeOf(library) === "myreader" &&
    library.sourceType === "local" &&
    isAndroidSafUri(library.sourcePath)
  )
}

export function createAndroidSafMirrorDirectory(): Directory {
  const mirrors = new Directory(Paths.document, SAF_MIRRORS_DIR)
  if (!mirrors.exists) {
    mirrors.create({ idempotent: true, intermediates: true })
  }
  const mirror = new Directory(mirrors, uuid())
  mirror.create({ intermediates: true })
  return mirror
}

export async function pullAndroidSafControl(
  sourceRootUri: string,
  mirrorRootUri: string,
): Promise<void> {
  const source = childDirectory(sourceRootUri, LIBRARY_MYREADER_DIR)
  if (!source) throw new Error("MYREADER_LIBRARY_MARKER_NOT_FOUND")
  const destination = new Directory(mirrorRootUri, LIBRARY_MYREADER_DIR)
  await mergeDirectoryTree(source, destination)
  ensureDirectoryPath(mirrorRootUri, "Books")
}

export async function pushAndroidSafControl(library: Library): Promise<void> {
  if (!isAndroidSafLibrary(library) || !library.sourcePath) return
  const source = new Directory(library.path, LIBRARY_MYREADER_DIR)
  const destination = ensureDirectoryPath(
    library.sourcePath,
    LIBRARY_MYREADER_DIR,
  )
  await mergeDirectoryTree(source, destination)
  ensureDirectoryPath(library.sourcePath, "Books")
}

export async function publishAndroidSafBook(
  library: Library,
  relativePath: string,
  coverRelativePath?: string,
): Promise<void> {
  if (!isAndroidSafLibrary(library) || !library.sourcePath) return
  const source = new File(libraryBookFileUri(library, relativePath))
  if (!source.exists) throw new Error("ANDROID_SAF_BOOK_SOURCE_NOT_FOUND")
  await copyFileIntoTree(source, library.sourcePath, relativePath)
  if (!coverRelativePath) return
  const cover = new File(libraryBookFileUri(library, coverRelativePath))
  if (!cover.exists) throw new Error("ANDROID_SAF_BOOK_COVER_SOURCE_NOT_FOUND")
  await copyFileIntoTree(cover, library.sourcePath, coverRelativePath)
}

export async function cacheAndroidSafBookCovers(
  library: Library,
  relativePaths: string[],
): Promise<void> {
  if (!isAndroidSafLibrary(library) || !library.sourcePath) return
  for (const relativePath of relativePaths) {
    const destination = new File(libraryBookFileUri(library, relativePath))
    if (destination.exists && (destination.size ?? 0) > 0) continue
    if (!destination.parentDirectory.exists) {
      destination.parentDirectory.create({ intermediates: true })
    }
    try {
      await copyFileFromTree(library.sourcePath, relativePath, destination)
    } catch {
      // Covers are optional derived assets; retry on the next reconciliation.
    }
  }
}

export async function installAndroidSafBookForRead(
  library: Library,
  bookId: number,
  format: string,
  relativePath: string,
): Promise<void> {
  if (!isAndroidSafLibrary(library) || !library.sourcePath) return

  const finalFile = new File(libraryBookFileUri(library, relativePath))
  const localState = await getFileState(library, relativePath)
  if (localState?.isLocallyAvailable && finalFile.exists) return

  const expected = await getMyreaderBookContent(
    library.path,
    librarySidecarRootUri(library),
    bookId,
    format,
  )
  if (expected.relativePath !== relativePath) {
    throw new Error("MYREADER_BOOK_FILE_PATH_MISMATCH")
  }

  if (!finalFile.parentDirectory.exists) {
    finalFile.parentDirectory.create({ intermediates: true })
  }
  const partialFile = new File(`${finalFile.uri}.part`)
  if (partialFile.exists) partialFile.delete()

  try {
    const copied = await copyFileFromTree(
      library.sourcePath,
      relativePath,
      partialFile,
    )
    if (!copied) throw new Error("ANDROID_SAF_BOOK_SOURCE_NOT_FOUND")
    await installVerifiedDownloadedFile(
      library,
      relativePath,
      partialFile.uri,
      finalFile.uri,
      expected.size,
      expected.sha256,
    )
  } catch (error) {
    if (partialFile.exists) partialFile.delete()
    await markFileSourceMissing(library, relativePath)
    throw error
  }
}

export {
  managedBookCoverRelativePaths,
  managedBookRelativePaths,
} from "./android-saf-paths"

export async function reconcileAndroidSafBooks(
  library: Library,
  expectedRelativePaths: string[],
): Promise<void> {
  if (!isAndroidSafLibrary(library) || !library.sourcePath) return

  const expectedDirectories = new Set(
    expectedRelativePaths
      .map(managedBookDirectory)
      .filter((path): path is string => path !== null),
  )
  for (const directory of listChildDirectories(library.sourcePath, "Books")) {
    const path = `Books/${directory.name}`
    if (
      isManagedBookDirectoryName(directory.name) &&
      !expectedDirectories.has(path)
    ) {
      directory.delete()
    }
  }

  for (const relativePath of expectedRelativePaths) {
    if (!fileExistsAtPath(library.sourcePath, relativePath)) {
      await markFileSourceMissing(library, relativePath)
    }
  }
}

export function deleteAndroidSafBook(
  library: Library,
  relativePath: string,
): void {
  if (!isAndroidSafLibrary(library) || !library.sourcePath) return
  const directory = managedBookDirectory(relativePath)
  if (directory) deleteDirectoryAtPath(library.sourcePath, directory)
}

export function deleteAndroidSafMirror(library: Library): void {
  if (!isAndroidSafLibrary(library)) return
  const mirrors = new Directory(Paths.document, SAF_MIRRORS_DIR)
  if (!library.path.startsWith(mirrors.uri)) return
  const mirror = new Directory(library.path)
  if (mirror.exists) mirror.delete()
}
