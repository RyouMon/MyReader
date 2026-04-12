import { Platform } from "react-native";

import SecurityScopedBookmarksModule from "../../modules/my-module";

import type { MobileLibrary } from "./types";

export type SecurityScopedAccessResult = {
  uri: string;
  stale: boolean;
};

export async function createSecurityScopedBookmark(uri: string) {
  if (Platform.OS !== "ios") {
    return null;
  }

  return SecurityScopedBookmarksModule.createBookmarkForDirectoryAsync(uri);
}

export async function resolveSecurityScopedBookmark(bookmarkBase64: string) {
  if (Platform.OS !== "ios") {
    return {
      uri: "",
      stale: false,
    };
  }

  return SecurityScopedBookmarksModule.resolveBookmarkAsync(bookmarkBase64);
}

export async function withSecurityScopedLibraryAccess<T>(
  library: MobileLibrary,
  callback: (resolvedPath: string) => Promise<T> | T
): Promise<{ result: T; refreshedLibrary?: MobileLibrary }> {
  const bookmark = library.securityScopedBookmark;

  if (Platform.OS !== "ios" || !bookmark) {
    return {
      result: await callback(library.path),
    };
  }

  const access = await SecurityScopedBookmarksModule.startAccessingBookmarkAsync(
    bookmark.bookmarkBase64
  );

  let refreshedLibrary: MobileLibrary | undefined;

  try {
    if (access.stale) {
      const refreshed = await createSecurityScopedBookmark(access.uri);
      if (refreshed) {
        refreshedLibrary = {
          ...library,
          path: refreshed.resolvedUri,
          securityScopedBookmark: refreshed,
        };
      }
    }

    return {
      result: await callback(access.uri),
      refreshedLibrary,
    };
  } finally {
    SecurityScopedBookmarksModule.stopAccessingBookmark(access.uri);
  }
}
