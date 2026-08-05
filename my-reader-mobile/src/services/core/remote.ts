import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { Directory, Paths } from "expo-file-system"
import {
  dataSourceListDirectories,
  dataSourceTestConnection,
  libraryAddRemote,
  libraryCreateRemoteMyreader,
  libraryOpenRemoteMyreader,
  libraryRefreshRemote,
  type RemoteCredential as CoreRemoteCredential,
  type RemoteDirectoryEntry as CoreRemoteDirectoryEntry,
} from "my-reader-core"
import { refreshAccessToken } from "../auth/onedrive"
import { libraryContainerRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"
import {
  type DataSourceSecrets,
  readOneDriveRefreshToken,
  readWebDavPassword,
} from "../storage/credentials"
import {
  appConfigPath,
  type AppConfigSnapshot,
  libraryResultFromCore,
  toCoreDataSource,
} from "./app-config"

export type RemoteDirectoryEntry = CoreRemoteDirectoryEntry

type RemoteLibraryResult = {
  config: AppConfigSnapshot
  library: Library
}

async function credentialFor(
  source: DataSource,
  secrets?: DataSourceSecrets,
): Promise<CoreRemoteCredential> {
  if (source.type === "webdav") {
    const password =
      secrets?.type === "webdav"
        ? secrets.password
        : await readWebDavPassword(source.id)
    if (!password) {
      throw new Error("WEBDAV_PASSWORD_REQUIRED")
    }
    return {
      kind: "webdav",
      password,
    }
  }

  if (secrets?.type === "onedrive" && secrets.accessToken) {
    return {
      kind: "onedrive",
      accessToken: secrets.accessToken,
    }
  }
  const refreshToken = await readOneDriveRefreshToken(source.id)
  if (!refreshToken) {
    throw new Error("ONEDRIVE_REFRESH_TOKEN_REQUIRED")
  }
  const { accessToken } = await refreshAccessToken(source.id)
  return {
    kind: "onedrive",
    accessToken,
  }
}

export async function testRemoteDataSource(
  source: DataSource,
  secrets?: DataSourceSecrets,
): Promise<void> {
  const credential = await credentialFor(source, secrets)
  await dataSourceTestConnection(toCoreDataSource(source), credential)
}

export async function listRemoteDirectories(
  source: DataSource,
  path: string,
): Promise<RemoteDirectoryEntry[]> {
  const credential = await credentialFor(source)
  return dataSourceListDirectories(appConfigPath, source.id, path, credential)
}

export async function addRemoteLibrary(
  source: DataSource,
  sourcePath: string,
): Promise<RemoteLibraryResult> {
  const librariesRoot = new Directory(Paths.document, "libraries")
  if (!librariesRoot.exists) {
    librariesRoot.create({ idempotent: true, intermediates: true })
  }
  const credential = await credentialFor(source)
  return libraryResultFromCore(
    await libraryAddRemote(
      appConfigPath,
      {
        dataSourceId: source.id,
        sourcePath,
        librariesRootPath: toNativeFilesystemPath(librariesRoot.uri),
        librariesRootUri: librariesRoot.uri,
        addedAt: Date.now(),
      },
      credential,
    ),
  )
}

function librariesRoot(): Directory {
  const root = new Directory(Paths.document, "libraries")
  if (!root.exists) {
    root.create({ idempotent: true, intermediates: true })
  }
  return root
}

export async function createRemoteMyreaderLibrary(
  source: DataSource,
  sourcePath: string,
  name: string,
): Promise<RemoteLibraryResult> {
  const root = librariesRoot()
  const credential = await credentialFor(source)
  return libraryResultFromCore(
    await libraryCreateRemoteMyreader(
      appConfigPath,
      {
        dataSourceId: source.id,
        sourcePath,
        librariesRootPath: toNativeFilesystemPath(root.uri),
        librariesRootUri: root.uri,
        name,
        addedAt: Date.now(),
      },
      credential,
      Date.now(),
    ),
  )
}

export async function openRemoteMyreaderLibrary(
  source: DataSource,
  sourcePath: string,
): Promise<RemoteLibraryResult> {
  const root = librariesRoot()
  const credential = await credentialFor(source)
  return libraryResultFromCore(
    await libraryOpenRemoteMyreader(
      appConfigPath,
      {
        dataSourceId: source.id,
        sourcePath,
        librariesRootPath: toNativeFilesystemPath(root.uri),
        librariesRootUri: root.uri,
        addedAt: Date.now(),
      },
      credential,
      Date.now(),
    ),
  )
}

export async function refreshRemoteLibrary(
  library: Library,
  source: DataSource,
): Promise<RemoteLibraryResult> {
  const credential = await credentialFor(source)
  return libraryResultFromCore(
    await libraryRefreshRemote(
      appConfigPath,
      library.id,
      toNativeFilesystemPath(libraryContainerRootUri(library.id)),
      credential,
    ),
  )
}
