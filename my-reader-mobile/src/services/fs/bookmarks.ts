import type { Library } from "@my-reader/tools/types/library"
import { Platform } from "react-native"

import type { ResolveBookmarkResult } from "../../../modules/security-scoped-bookmarks/src/MyReaderSecurityScopedBookmarks.types"

type SecurityScopedBookmarksNativeModule = {
  createBookmarkForDirectoryAsync: (uri: string) => Promise<{
    bookmarkBase64: string
    resolvedUri: string
    stale: boolean
  }>
  startAccessingBookmarkAsync: (
    bookmarkBase64: string,
  ) => Promise<ResolveBookmarkResult>
  stopAccessingBookmark: (uri: string) => void
}

let cachedIOSModule: SecurityScopedBookmarksNativeModule | null | undefined

function getSecurityScopedBookmarksModule() {
  if (Platform.OS !== "ios") return null
  if (cachedIOSModule === undefined) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const nativeModule =
      require("../../../modules/security-scoped-bookmarks") as {
        default: SecurityScopedBookmarksNativeModule
      }
    /* eslint-enable @typescript-eslint/no-require-imports */
    cachedIOSModule = nativeModule.default
  }
  return cachedIOSModule
}

export async function createSecurityScopedBookmark(uri: string) {
  const module = getSecurityScopedBookmarksModule()
  return module?.createBookmarkForDirectoryAsync(uri) ?? null
}

/** Runs an operation while access to an iOS external directory is active. */
export async function withSecurityScopedLibraryAccess<T>(
  library: Library,
  operation: (resolvedUri: string) => Promise<T> | T,
): Promise<T> {
  const module = getSecurityScopedBookmarksModule()
  const bookmark = library.securityScopedBookmark
  if (!module || !bookmark) return operation(library.path)

  const access = await module.startAccessingBookmarkAsync(
    bookmark.bookmarkBase64,
  )
  try {
    return await operation(access.uri)
  } finally {
    module.stopAccessingBookmark(access.uri)
  }
}
