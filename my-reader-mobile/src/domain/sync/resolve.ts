import type { DataSource, Library, WebDavDataSource } from "../types"
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "../../constants/local-library-data-source"
import {
  readWebDavPassword,
  readOneDriveRefreshToken,
} from "../../services/storage/credentials"
import {
  libraryRootUri,
  librarySidecarRootUri,
} from "@/src/services/fs/library-paths"
import { toNativeFilesystemPath } from "@/src/services/fs/path"
import { SyncConfigError } from "../../errors"
import { createRemoteBackend } from "../../services/remote/factory"
import type { RemoteBackend } from "../../services/remote/backend"
import { LocalDirectBackend } from "./local"
import i18n from "@/src/i18n"

export type SyncBackend = RemoteBackend | LocalDirectBackend

export type NativeSidecarStorageConfig =
  | { kind: "local-direct"; root: string }
  | {
      kind: "webdav"
      endpoint: string
      username: string
      password: string
      root: string | null
    }
  | { kind: "onedrive"; accessToken: string; root: string | null }

export type ResolvedSyncTarget = {
  backend: SyncBackend
  sidecarStorage: NativeSidecarStorageConfig
  dataSourceId: string
  libraryId: string
  /** Calibre tree root (metadata, books, covers). */
  libraryRootUri: string
  /** Root for `{root}/.myreader/` sidecar data. */
  librarySidecarRootUri: string
}

function remoteLibraryRoot(
  sourceRoot: string | null | undefined,
  libraryPath: string,
): string {
  const parts = [sourceRoot, libraryPath]
    .map((value) => value?.trim().replace(/^\/+|\/+$/g, "") ?? "")
    .filter(Boolean)
  return parts.length === 0 ? "/" : `/${parts.join("/")}`
}

export async function resolveSyncTarget(
  library: Library,
  dataSources: DataSource[],
): Promise<ResolvedSyncTarget> {
  const rootUri = libraryRootUri(library)
  const sidecarRootUri = librarySidecarRootUri(library)

  if (library.sourceType === "webdav") {
    const rawSource = dataSources.find(
      (item) => item.id === library.dataSourceId && item.type === "webdav",
    )
    if (!rawSource || rawSource.type !== "webdav") {
      throw new SyncConfigError(i18n.t("sync.webdavSourceNotFound"))
    }
    const password = (await readWebDavPassword(rawSource.id)) ?? ""
    if (!password) {
      throw new SyncConfigError(i18n.t("sync.webdavPasswordMissing"))
    }
    const source: WebDavDataSource = { ...rawSource, password }
    const backend = await createRemoteBackend(source, library)
    if (!backend)
      throw new SyncConfigError(i18n.t("sync.webdavPasswordMissing"))
    return {
      backend,
      sidecarStorage: {
        kind: "webdav",
        endpoint: rawSource.endpoint,
        username: rawSource.username,
        password,
        root: remoteLibraryRoot(
          rawSource.rootPath,
          library.sourcePath ?? library.path ?? "",
        ),
      },
      dataSourceId: rawSource.id,
      libraryId: library.id,
      libraryRootUri: rootUri,
      librarySidecarRootUri: sidecarRootUri,
    }
  }

  if (library.sourceType === "onedrive") {
    const rawSource = dataSources.find(
      (item) => item.id === library.dataSourceId && item.type === "onedrive",
    )
    if (!rawSource || rawSource.type !== "onedrive") {
      throw new SyncConfigError(i18n.t("sync.onedriveSourceNotFound"))
    }
    const refreshToken = await readOneDriveRefreshToken(rawSource.id)
    if (!refreshToken) {
      throw new SyncConfigError(i18n.t("sync.onedriveRefreshTokenMissing"))
    }
    const backend = await createRemoteBackend(rawSource, library)
    if (!backend)
      throw new SyncConfigError(i18n.t("sync.onedriveRefreshTokenMissing"))
    const authorization = (await backend.getAuthHeaders()).Authorization
    const accessToken = authorization?.replace(/^Bearer\s+/i, "") ?? ""
    if (!accessToken) {
      throw new SyncConfigError(i18n.t("sync.onedriveRefreshTokenMissing"))
    }
    return {
      backend,
      sidecarStorage: {
        kind: "onedrive",
        accessToken,
        root: remoteLibraryRoot(
          rawSource.rootPath,
          library.sourcePath ?? library.path ?? "",
        ),
      },
      dataSourceId: rawSource.id,
      libraryId: library.id,
      libraryRootUri: rootUri,
      librarySidecarRootUri: sidecarRootUri,
    }
  }

  const backend = new LocalDirectBackend(rootUri)
  return {
    backend,
    sidecarStorage: {
      kind: "local-direct",
      root: toNativeFilesystemPath(rootUri),
    },
    dataSourceId: library.dataSourceId ?? LOCAL_LIBRARY_DATA_SOURCE_ID,
    libraryId: library.id,
    libraryRootUri: rootUri,
    librarySidecarRootUri: sidecarRootUri,
  }
}

export function isLocalDirect(
  backend: SyncBackend,
): backend is LocalDirectBackend {
  return backend.kind === "local-direct"
}

export function isRemoteBackend(
  backend: SyncBackend,
): backend is RemoteBackend {
  return backend.kind === "onedrive" || backend.kind === "webdav"
}
