import type { Library } from "@my-reader/tools/types/library"
import { Directory } from "expo-file-system"
import { Platform } from "react-native"

import i18n from "@/src/i18n"
import { createSecurityScopedBookmark } from "@/src/services/fs/bookmarks"

type PickedDirectoryLike = {
  uri: string
  name?: string
}

export type PickedLocalLibrary = PickedDirectoryLike & {
  securityScopedBookmark: NonNullable<Library["securityScopedBookmark"]>
}

/** Opens the iOS directory picker and persists access for future launches. */
export async function pickLocalLibraryDirectory(): Promise<PickedLocalLibrary | null> {
  if (Platform.OS !== "ios") {
    throw new Error("LOCAL_STORAGE_UNSUPPORTED")
  }

  let directory: PickedDirectoryLike | null = null
  try {
    directory = await Directory.pickDirectoryAsync()
  } catch {
    return null
  }
  if (directory === null) return null

  const securityScopedBookmark = await createSecurityScopedBookmark(
    directory.uri,
  )
  if (!securityScopedBookmark) {
    throw new Error("SECURITY_SCOPED_BOOKMARK_REQUIRED")
  }

  return {
    uri: securityScopedBookmark.resolvedUri,
    name:
      directory.name ||
      new Directory(directory.uri).name ||
      i18n.t("common.unnamedLibrary"),
    securityScopedBookmark,
  }
}
