import type { Library } from "@my-reader/tools/types/library"

import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { withLocalLibraryCalibreRoot } from "@/src/domain/library/local-library-content"
import { librarySidecarRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"

function sidecarRootPath(library: Library): string {
  return toNativeFilesystemPath(librarySidecarRootUri(library))
}

export async function listFavoriteBookIds(library: Library): Promise<number[]> {
  return JSON.parse(
    await MyReaderRustComponents.listFavoriteBookIds(sidecarRootPath(library)),
  )
}

export function setFavoriteBook(
  library: Library,
  bookId: number,
  isFavorite: boolean,
): Promise<void> {
  return withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    MyReaderRustComponents.setFavoriteBook(
      sidecarRootPath(library),
      toNativeFilesystemPath(libraryRootUri),
      bookId,
      isFavorite,
      Date.now(),
    ),
  )
}
