import { Platform } from "react-native";

import i18n from "@/src/i18n";

import type { Library } from "../../data/types";
import type { ResolveBookmarkResult } from "../../../modules/my-module/src/MyReaderSecurityScopedBookmarks.types";

export type SecurityScopedAccessResult = {
  uri: string;
  stale: boolean;
};

type SecurityScopedBookmarksNativeModule = {
  createBookmarkForDirectoryAsync: (uri: string) => Promise<{
    bookmarkBase64: string;
    resolvedUri: string;
    stale: boolean;
  }>;
  resolveBookmarkAsync: (bookmarkBase64: string) => Promise<ResolveBookmarkResult>;
  startAccessingBookmarkAsync: (bookmarkBase64: string) => Promise<ResolveBookmarkResult>;
  stopAccessingBookmark: (uri: string) => void;
};

let cachedIOSModule: SecurityScopedBookmarksNativeModule | null | undefined;

/**
 * Loads the iOS native bookmark module only when it is actually needed.
 */
function getSecurityScopedBookmarksModule() {
  if (Platform.OS !== "ios") {
    return null;
  }

  if (cachedIOSModule === undefined) {
    cachedIOSModule = (
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../../modules/my-module") as { default: SecurityScopedBookmarksNativeModule }
    ).default;
  }

  return cachedIOSModule;
}

/**
 * Converts unknown native errors into stable log text for debugging.
 */
function stringifyNativeError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Detects whether the native error message matches a known pattern.
 */
function isNativeErrorMessage(error: unknown, pattern: RegExp) {
  const message = error instanceof Error ? error.message : String(error);
  return pattern.test(message);
}

/**
 * Maps low-level bookmark native errors to user-facing Chinese messages.
 */
function mapBookmarkErrorToChinese(action: string, error: unknown) {
  if (isNativeErrorMessage(error, /Invalid URI/i)) {
    return i18n.t("securityBookmarks.invalidUrl", { action });
  }

  if (isNativeErrorMessage(error, /Invalid security-scoped bookmark data/i)) {
    return i18n.t("securityBookmarks.invalidBookmark", { action });
  }

  if (isNativeErrorMessage(error, /Unsupported URI scheme for bookmark creation/i)) {
    return i18n.t("securityBookmarks.unsupportedUrl", { action });
  }

  if (isNativeErrorMessage(error, /Unable to start accessing security-scoped resource/i)) {
    return i18n.t("securityBookmarks.cannotAccess", { action });
  }

  if (isNativeErrorMessage(error, /bookmark.*stale|stale/i)) {
    return i18n.t("securityBookmarks.expired", { action });
  }

  return i18n.t("securityBookmarks.genericError", { action });
}

/**
 * Wraps native bookmark failures with localized error messages.
 */
function createBookmarkOperationError(action: string, error: unknown) {
  console.error(`[security-scoped-bookmarks] ${action} native error`, error);
  console.error(
    `[security-scoped-bookmarks] ${action} native error (stringified)`,
    stringifyNativeError(error)
  );

  return new Error(mapBookmarkErrorToChinese(action, error), {
    cause: error,
  });
}

/**
 * Creates a security-scoped bookmark for an iOS directory URI.
 */
export async function createSecurityScopedBookmark(uri: string) {
  const securityScopedBookmarksModule = getSecurityScopedBookmarksModule();
  if (!securityScopedBookmarksModule) {
    return null;
  }

  try {
    return await securityScopedBookmarksModule.createBookmarkForDirectoryAsync(uri);
  } catch (error) {
    throw createBookmarkOperationError(i18n.t("securityBookmarks.createBookmark"), error);
  }
}

/**
 * Resolves a stored security-scoped bookmark back to a runtime URI.
 */
export async function resolveSecurityScopedBookmark(bookmarkBase64: string) {
  const securityScopedBookmarksModule = getSecurityScopedBookmarksModule();
  if (!securityScopedBookmarksModule) {
    return {
      uri: "",
      stale: false,
    };
  }

  try {
    return await securityScopedBookmarksModule.resolveBookmarkAsync(bookmarkBase64);
  } catch (error) {
    throw createBookmarkOperationError(i18n.t("securityBookmarks.restoreBookmark"), error);
  }
}

/**
 * Runs a short-lived operation while iOS security-scoped access is active.
 * Do not return a path/URI here for deferred use by other native APIs; copy or read
 * the target into app-owned storage inside the callback instead.
 */
export async function withSecurityScopedLibraryAccess<T>(
  library: Library,
  callback: (resolvedPath: string) => Promise<T> | T
): Promise<{ result: T; refreshedLibrary?: Library }> {
  const securityScopedBookmarksModule = getSecurityScopedBookmarksModule();
  const bookmark = library.securityScopedBookmark;

  if (!securityScopedBookmarksModule || !bookmark) {
    return {
      result: await callback(library.path),
    };
  }

  let access: SecurityScopedAccessResult;

  try {
    access = await securityScopedBookmarksModule.startAccessingBookmarkAsync(
      bookmark.bookmarkBase64
    );
  } catch (error) {
    throw createBookmarkOperationError(i18n.t("securityBookmarks.accessDirectory"), error);
  }

  let refreshedLibrary: Library | undefined;

  try {
    if (access.stale) {
      try {
        const refreshed = await createSecurityScopedBookmark(access.uri);
        if (refreshed) {
          refreshedLibrary = {
            ...library,
            path: refreshed.resolvedUri,
            securityScopedBookmark: refreshed,
          };
        }
      } catch (error) {
        throw createBookmarkOperationError(i18n.t("securityBookmarks.refreshBookmark"), error);
      }
    }

    return {
      result: await callback(access.uri),
      refreshedLibrary,
    };
  } finally {
    securityScopedBookmarksModule.stopAccessingBookmark(access.uri);
  }
}
