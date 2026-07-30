import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { Directory, File, Paths } from "expo-file-system"
import {
  registryAddRemoteLibrary,
  registryListRemoteDirectories,
  registryRefreshRemoteLibrary,
  registryTestRemoteDataSource,
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
  type DeviceRegistry,
  libraryResultFromCore,
  toCoreDataSource,
} from "./device-registry"

export type RemoteDirectoryEntry = CoreRemoteDirectoryEntry

type RemoteLibraryResult = {
  registry: DeviceRegistry
  library: Library
}

const registryPath = toNativeFilesystemPath(
  new File(Paths.document, "device-registry.json").uri,
)

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
  await registryTestRemoteDataSource(toCoreDataSource(source), credential)
}

export async function listRemoteDirectories(
  source: DataSource,
  path: string,
): Promise<RemoteDirectoryEntry[]> {
  const credential = await credentialFor(source)
  return registryListRemoteDirectories(
    registryPath,
    source.id,
    path,
    credential,
  )
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
    await registryAddRemoteLibrary(
      registryPath,
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

export async function refreshRemoteLibrary(
  library: Library,
  source: DataSource,
): Promise<RemoteLibraryResult> {
  const credential = await credentialFor(source)
  return libraryResultFromCore(
    await registryRefreshRemoteLibrary(
      registryPath,
      library.id,
      toNativeFilesystemPath(libraryContainerRootUri(library.id)),
      credential,
    ),
  )
}
