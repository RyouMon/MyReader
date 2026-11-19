import type {
  DataSource,
  DataSourceWebdav,
} from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { refreshAccessToken } from "../auth/onedrive"
import { appConfigPath } from "../core/app-config"
import { resolveLibraryStorage, type LibraryStorageConfig } from "../core/sync"
import { resolveRemoteCredential } from "../core/remote-credentials"
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
import { CoreRemoteBackend } from "./core-backend"
import { CredentialError } from "../../errors"

type WebDavDataSource = DataSourceWebdav & { password: string }

export type ResolvedRemoteBackend = {
  backend: RemoteBackend
  libraryStorage: LibraryStorageConfig
}

export async function resolveRemoteBackend(
  dataSource: DataSource,
  library: Library,
): Promise<ResolvedRemoteBackend | null> {
  switch (dataSource.type) {
    case "onedrive":
      return resolveOneDriveBackend(dataSource, library)
    case "webdav":
      return resolveWebDavBackend(dataSource, library)
    case "gdrive":
    case "dropbox":
    case "s3":
      return resolveCoreBackend(dataSource, library)
  }
}

async function resolveOneDriveBackend(
  dataSource: Extract<DataSource, { type: "onedrive" }>,
  library: Library,
): Promise<ResolvedRemoteBackend | null> {
  if (!(await readOneDriveRefreshToken(dataSource.id))) return null
  const { accessToken, expiresAt } = await refreshAccessToken(dataSource.id)
  setCachedAuth(
    dataSource.id,
    { Authorization: `Bearer ${accessToken}` },
    expiresAt,
  )
  const libraryStorage = resolveLibraryStorageForCredential(library, {
    kind: "onedrive",
    accessToken,
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

async function resolveWebDavBackend(
  dataSource: Extract<DataSource, { type: "webdav" }>,
  library: Library,
): Promise<ResolvedRemoteBackend | null> {
  const password = (await readWebDavPassword(dataSource.id)) ?? ""
  if (!password) return null
  const source: WebDavDataSource = { ...dataSource, password }
  const libraryStorage = resolveLibraryStorageForCredential(library, {
    kind: "webdav",
    password,
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

async function resolveCoreBackend(
  dataSource: Extract<DataSource, { type: "gdrive" | "dropbox" | "s3" }>,
  library: Library,
): Promise<ResolvedRemoteBackend | null> {
  let credential
  try {
    credential = await resolveRemoteCredential(dataSource)
  } catch (error) {
    if (error instanceof CredentialError) return null
    throw error
  }
  const libraryStorage = resolveLibraryStorageForCredential(library, credential)
  if (libraryStorage.kind !== dataSource.type) return null
  return {
    backend: new CoreRemoteBackend(dataSource.id, dataSource, library),
    libraryStorage,
  }
}

function resolveLibraryStorageForCredential(
  library: Library,
  credential: Parameters<typeof resolveLibraryStorage>[0]["credential"],
) {
  return resolveLibraryStorage({
    configPath: appConfigPath,
    libraryId: library.id,
    localRootPath: toNativeFilesystemPath(libraryRootUri(library)),
    credential,
  })
}

export async function createRemoteBackend(
  dataSource: DataSource,
  library: Library,
): Promise<RemoteBackend | null> {
  return (await resolveRemoteBackend(dataSource, library))?.backend ?? null
}
