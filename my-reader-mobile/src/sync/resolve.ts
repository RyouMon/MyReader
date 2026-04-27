import type { DataSource, MobileLibrary, WebDavDataSource } from "../data/types";
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "../constants/local-library-data-source";
import { readWebDavPassword } from "../store/secure-credential-store";
import { parentDirectoryUriForFileUri } from "../utils/io";

import { buildBackend, resolveLibraryBooksDir, type SyncBackend } from "./backend";

export type ResolvedSyncTarget = {
  backend: SyncBackend;
  /** Stable per-backend scope used for both manifest naming and file_state rows. */
  dataSourceId: string;
  libraryId: string;
  /** Local directory for materialized remote files. */
  libraryCacheDirUri: string;
  isLocalDirect: boolean;
};

/**
 * Resolve a library + its data source into a ready-to-use `SyncBackend` plus
 * the local cache directory used to stage downloaded bytes.
 *
 * Throws when the library references a WebDAV source that can't be found or
 * whose password hasn't been unlocked yet — callers should surface this to
 * the user so they can fix credentials.
 */
export async function resolveSyncTarget(
  library: MobileLibrary,
  dataSources: DataSource[],
): Promise<ResolvedSyncTarget> {
  const libraryCacheDirUri = resolveLibraryBooksDir(library.id);

  if (library.sourceType === "webdav") {
    const rawSource = dataSources.find(
      (item) => item.id === library.dataSourceId && item.type === "webdav",
    );
    if (!rawSource || rawSource.type !== "webdav") {
      throw new Error("当前书库关联的 WebDAV 数据源不存在。");
    }
    const password = rawSource.password ?? (await readWebDavPassword(rawSource.id)) ?? "";
    if (!password) {
      throw new Error("当前 WebDAV 数据源缺少密码，请重新编辑数据源。");
    }
    const source: WebDavDataSource = { ...rawSource, password };
    const backend = buildBackend({
      kind: "webdav",
      source,
      libraryPath: library.sourcePath ?? library.path ?? "",
    });
    return {
      backend,
      dataSourceId: rawSource.id,
      libraryId: library.id,
      libraryCacheDirUri,
      isLocalDirect: false,
    };
  }

  const libraryRootUri = parentDirectoryUriForFileUri(library.metadataUri);
  if (!libraryRootUri) {
    throw new Error("无法解析本地书库根目录。");
  }
  const backend = buildBackend({ kind: "local-direct", libraryRootUri });
  return {
    backend,
    dataSourceId: library.dataSourceId ?? LOCAL_LIBRARY_DATA_SOURCE_ID,
    libraryId: library.id,
    libraryCacheDirUri,
    isLocalDirect: true,
  };
}
