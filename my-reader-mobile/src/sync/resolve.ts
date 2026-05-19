import type { DataSource, Library, WebDavDataSource } from "../data/types";
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "../constants/local-library-data-source";
import { readWebDavPassword } from "../store/secure-credential-store";
import { parentDirectoryUriForFileUri } from "../utils/io";
import { SyncConfigError } from "../errors";

import { buildBackend, resolveLibraryBooksDir, type SyncBackend } from "./backend";
import i18n from "@/src/i18n";

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
  library: Library,
  dataSources: DataSource[],
): Promise<ResolvedSyncTarget> {
  const libraryCacheDirUri = resolveLibraryBooksDir(library.id);

  if (library.sourceType === "webdav") {
    const rawSource = dataSources.find(
      (item) => item.id === library.dataSourceId && item.type === "webdav",
    );
    if (!rawSource || rawSource.type !== "webdav") {
      throw new SyncConfigError(i18n.t("sync.webdavSourceNotFound"));
    }
    const password = rawSource.password ?? (await readWebDavPassword(rawSource.id)) ?? "";
    if (!password) {
      throw new SyncConfigError(i18n.t("sync.webdavPasswordMissing"));
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

  const libraryRootUri = parentDirectoryUriForFileUri(library.metadataUri!);
  if (!libraryRootUri) {
    throw new SyncConfigError(i18n.t("sync.cannotResolveLocalPath"));
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
