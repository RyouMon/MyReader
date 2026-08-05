import type { Library } from "@my-reader/tools/types/library"
import { Directory } from "expo-file-system"

import i18n from "@/src/i18n"
import { createSecurityScopedBookmark } from "@/src/services/fs/bookmarks"

type PickedDirectoryLike = {
  uri: string
  name?: string
}

export type PickedLocalLibrary = PickedDirectoryLike & {
  securityScopedBookmark?: Library["securityScopedBookmark"]
}

export type PickedCalibreLibrary = PickedLocalLibrary

export async function pickLocalLibraryDirectory(): Promise<PickedLocalLibrary | null> {
  let directory: PickedDirectoryLike | null = null

  try {
    directory = await Directory.pickDirectoryAsync()
  } catch {
    return null
  }

  if (directory == null) {
    return null
  }

  const securityScopedBookmark = await createSecurityScopedBookmark(
    directory.uri,
  )
  return {
    uri: securityScopedBookmark?.resolvedUri ?? directory.uri,
    name:
      directory.name ||
      new Directory(directory.uri).name ||
      i18n.t("common.unnamedLibrary"),
    securityScopedBookmark: securityScopedBookmark ?? undefined,
  }
}

export function pickCalibreLibrary(): Promise<PickedCalibreLibrary | null> {
  return pickLocalLibraryDirectory()
}
