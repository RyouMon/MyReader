import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { Directory, File, Paths } from "expo-file-system"
import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { refreshAccessToken } from "../auth/onedrive"
import { libraryContainerRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"
import {
  type DataSourceSecrets,
  readOneDriveRefreshToken,
  readWebDavPassword,
} from "../storage/credentials"
import type { DeviceRegistry } from "./device-registry"

export type RemoteDirectoryEntry = {
  name: string
  path: string
  isDirectory: boolean
}

type RemoteLibraryResult = {
  registry: DeviceRegistry
  library: Library
}

const registryPath = toNativeFilesystemPath(
  new File(Paths.document, "device-registry.json").uri,
)

function safeSource(source: DataSource): DataSource {
  if (source.type !== "onedrive") {
    return source
  }
  const {
    refreshToken: _refreshToken,
    accessTokenExpiresAt: _expiresAt,
    ...safe
  } = source
  return safe
}

async function credentialFor(
  source: DataSource,
  secrets?: DataSourceSecrets,
): Promise<Record<string, string>> {
  if (source.type === "webdav") {
    const password =
      secrets?.type === "webdav"
        ? secrets.password
        : await readWebDavPassword(source.id)
    if (!password) {
      throw new Error("WEBDAV_PASSWORD_REQUIRED")
    }
    return { type: "webdav", password }
  }

  if (secrets?.type === "onedrive" && secrets.accessToken) {
    return { type: "onedrive", accessToken: secrets.accessToken }
  }
  const refreshToken = await readOneDriveRefreshToken(source.id)
  if (!refreshToken) {
    throw new Error("ONEDRIVE_REFRESH_TOKEN_REQUIRED")
  }
  const { accessToken } = await refreshAccessToken(source.id)
  return { type: "onedrive", accessToken }
}

export async function testRemoteDataSource(
  source: DataSource,
  secrets?: DataSourceSecrets,
): Promise<void> {
  const credential = await credentialFor(source, secrets)
  await MyReaderRustComponents.testRemoteDataSource(
    JSON.stringify(safeSource(source)),
    JSON.stringify(credential),
  )
}

export async function listRemoteDirectories(
  source: DataSource,
  path: string,
): Promise<RemoteDirectoryEntry[]> {
  const credential = await credentialFor(source)
  return JSON.parse(
    await MyReaderRustComponents.listRemoteDirectories(
      registryPath,
      source.id,
      path,
      JSON.stringify(credential),
    ),
  ) as RemoteDirectoryEntry[]
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
  return JSON.parse(
    await MyReaderRustComponents.addRemoteLibrary(
      registryPath,
      JSON.stringify({
        dataSourceId: source.id,
        sourcePath,
        librariesRootPath: toNativeFilesystemPath(librariesRoot.uri),
        librariesRootUri: librariesRoot.uri,
        addedAt: Date.now(),
      }),
      JSON.stringify(credential),
    ),
  ) as RemoteLibraryResult
}

export async function refreshRemoteLibrary(
  library: Library,
  source: DataSource,
): Promise<RemoteLibraryResult> {
  const credential = await credentialFor(source)
  return JSON.parse(
    await MyReaderRustComponents.refreshRemoteLibrary(
      registryPath,
      library.id,
      toNativeFilesystemPath(libraryContainerRootUri(library.id)),
      JSON.stringify(credential),
    ),
  ) as RemoteLibraryResult
}
