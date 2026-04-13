import { Platform } from "react-native";

import SecurityScopedBookmarksModule from "../../modules/my-module";

import type { MobileLibrary } from "./types";

export type SecurityScopedAccessResult = {
  uri: string;
  stale: boolean;
};

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

function isNativeErrorMessage(error: unknown, pattern: RegExp) {
  const message = error instanceof Error ? error.message : String(error);
  return pattern.test(message);
}

function mapBookmarkErrorToChinese(action: string, error: unknown) {
  if (isNativeErrorMessage(error, /Invalid URI/i)) {
    return `${action}失败：目录地址无效。`;
  }

  if (isNativeErrorMessage(error, /Invalid security-scoped bookmark data/i)) {
    return `${action}失败：保存的书库授权信息无效，请重新选择书库。`;
  }

  if (isNativeErrorMessage(error, /Unsupported URI scheme for bookmark creation/i)) {
    return `${action}失败：当前选择的目录地址格式不受支持，请改用“文件”中可授权的本地目录重新选择。`;
  }

  if (isNativeErrorMessage(error, /Unable to start accessing security-scoped resource/i)) {
    return `${action}失败：无法访问已授权的书库目录，请重新选择书库并授权。`;
  }

  if (isNativeErrorMessage(error, /bookmark.*stale|stale/i)) {
    return `${action}失败：书库授权信息已过期，请重新选择书库。`;
  }

  return `${action}失败：iOS 文件授权处理出错，请重试。`;
}

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

export async function createSecurityScopedBookmark(uri: string) {
  if (Platform.OS !== "ios") {
    return null;
  }

  try {
    return await SecurityScopedBookmarksModule.createBookmarkForDirectoryAsync(uri);
  } catch (error) {
    throw createBookmarkOperationError("创建书库授权", error);
  }
}

export async function resolveSecurityScopedBookmark(bookmarkBase64: string) {
  if (Platform.OS !== "ios") {
    return {
      uri: "",
      stale: false,
    };
  }

  try {
    return await SecurityScopedBookmarksModule.resolveBookmarkAsync(bookmarkBase64);
  } catch (error) {
    throw createBookmarkOperationError("恢复书库授权", error);
  }
}

/**
 * Runs a short-lived operation while iOS security-scoped access is active.
 * Do not return a path/URI here for deferred use by other native APIs; copy or read
 * the target into app-owned storage inside the callback instead.
 */
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

  let access: SecurityScopedAccessResult;

  try {
    access = await SecurityScopedBookmarksModule.startAccessingBookmarkAsync(
      bookmark.bookmarkBase64
    );
  } catch (error) {
    throw createBookmarkOperationError("访问书库目录", error);
  }

  let refreshedLibrary: MobileLibrary | undefined;

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
        throw createBookmarkOperationError("刷新书库授权", error);
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
