import type { DataSource, Library, WebDavDataSource } from "../../data/types";
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "../../constants/local-library-data-source";
import { readWebDavPassword, readOneDriveRefreshToken } from "../../services/storage/credentials";
import { parentDirectoryUriForFileUri } from "../../services/fs/path";
import { SyncConfigError } from "../../errors";
import { createRemoteBackend } from "../../services/remote/factory";
import type { RemoteBackend } from "../../services/remote/backend";
import { LocalDirectBackend } from "./local";
import { resolveLibraryBooksDir } from "../../services/fs/path";
import i18n from "@/src/i18n";

export type SyncBackend = RemoteBackend | LocalDirectBackend;

export type ResolvedSyncTarget = {
  backend: SyncBackend;
  dataSourceId: string;
  libraryId: string;
  libraryCacheDirUri: string;
};

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
    const password = (await readWebDavPassword(rawSource.id)) ?? "";
    if (!password) {
      throw new SyncConfigError(i18n.t("sync.webdavPasswordMissing"));
    }
    const source: WebDavDataSource = { ...rawSource, password };
    const backend = await createRemoteBackend(source, library);
    if (!backend) throw new SyncConfigError(i18n.t("sync.webdavPasswordMissing"));
    return {
      backend,
      dataSourceId: rawSource.id,
      libraryId: library.id,
      libraryCacheDirUri,
    };
  }

  if (library.sourceType === "onedrive") {
    const rawSource = dataSources.find(
      (item) => item.id === library.dataSourceId && item.type === "onedrive",
    );
    if (!rawSource || rawSource.type !== "onedrive") {
      throw new SyncConfigError(i18n.t("sync.onedriveSourceNotFound"));
    }
    const refreshToken = await readOneDriveRefreshToken(rawSource.id);
    if (!refreshToken) {
      throw new SyncConfigError(i18n.t("sync.onedriveRefreshTokenMissing"));
    }
    const backend = await createRemoteBackend(rawSource, library);
    if (!backend) throw new SyncConfigError(i18n.t("sync.onedriveRefreshTokenMissing"));
    return {
      backend,
      dataSourceId: rawSource.id,
      libraryId: library.id,
      libraryCacheDirUri,
    };
  }

  const libraryRootUri = parentDirectoryUriForFileUri(library.metadataUri!);
  if (!libraryRootUri) {
    throw new SyncConfigError(i18n.t("sync.cannotResolveLocalPath"));
  }
  const backend = new LocalDirectBackend(libraryRootUri);
  return {
    backend,
    dataSourceId: library.dataSourceId ?? LOCAL_LIBRARY_DATA_SOURCE_ID,
    libraryId: library.id,
    libraryCacheDirUri,
  };
}

export function isLocalDirect(backend: SyncBackend): boolean {
  return backend.kind === "local-direct";
}

export function isRemoteBackend(backend: SyncBackend): backend is RemoteBackend {
  return backend.kind === "onedrive" || backend.kind === "webdav";
}