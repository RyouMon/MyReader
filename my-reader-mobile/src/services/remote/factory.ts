import type {
  DataSource,
  DataSourceWebdav,
} from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { refreshAccessToken } from "../auth/onedrive"
import { appConfigPath } from "../core/app-config"
import { resolveLibraryStorage, type LibraryStorageConfig } from "../core/sync"
import { libraryRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"
import { setCachedAuth } from "./auth-cache"
import type { RemoteBackend } from "./backend"
import {
  readWebDavPassword,
  readOneDriveRefreshToken,
} from "../storage/credentials"

import { OneDriveRemoteBackend } from "./onedrive/backend"
import { WebDavRemoteBackend } from "./webdav/backend"

type WebDavDataSource = DataSourceWebdav & { password: string }

export type ResolvedRemoteBackend = {
  backend: RemoteBackend
  libraryStorage: LibraryStorageConfig
}

export async function resolveRemoteBackend(
  dataSource: DataSource,
  library: Library,
): Promise<ResolvedRemoteBackend | null> {
  if (dataSource.type === "onedrive") {
    const refreshToken = await readOneDriveRefreshToken(dataSource.id)
    if (!refreshToken) return null
    const { accessToken, expiresAt } = await refreshAccessToken(dataSource.id)
    setCachedAuth(
      dataSource.id,
      { Authorization: `Bearer ${accessToken}` },
      expiresAt,
    )
    const libraryStorage = resolveLibraryStorage({
      configPath: appConfigPath,
      libraryId: library.id,
      localRootPath: toNativeFilesystemPath(libraryRootUri(library)),
      credential: { kind: "onedrive", accessToken },
    })
    if (libraryStorage.kind !== "onedrive") return null
    return {
      backend: new OneDriveRemoteBackend(
        dataSource.id,
        libraryStorage.root ?? "/",
      ),
      libraryStorage,
    }
  }

  if (dataSource.type === "webdav") {
    const password = (await readWebDavPassword(dataSource.id)) ?? ""
    if (!password) return null
    const source: WebDavDataSource = { ...dataSource, password }
    const libraryStorage = resolveLibraryStorage({
      configPath: appConfigPath,
      libraryId: library.id,
      localRootPath: toNativeFilesystemPath(libraryRootUri(library)),
      credential: { kind: "webdav", password },
    })
    if (libraryStorage.kind !== "webdav") return null
    return {
      backend: new WebDavRemoteBackend(
        { ...source, rootPath: null },
        libraryStorage.root ?? "/",
      ),
      libraryStorage,
    }
  }

  return null
}

export async function createRemoteBackend(
  dataSource: DataSource,
  library: Library,
): Promise<RemoteBackend | null> {
  return (await resolveRemoteBackend(dataSource, library))?.backend ?? null
}
