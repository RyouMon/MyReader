import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { Directory, File, Paths } from "expo-file-system"
import MyReaderRustComponents, {
  type NativeRemoteCredential,
} from "@/modules/myreader-rust-components"
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
  libraryResultFromNative,
  toNativeDataSource,
} from "./device-registry"

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

async function credentialFor(
  source: DataSource,
  secrets?: DataSourceSecrets,
): Promise<NativeRemoteCredential> {
  if (source.type === "webdav") {
    const password =
      secrets?.type === "webdav"
        ? secrets.password
        : await readWebDavPassword(source.id)
    if (!password) {
      throw new Error("WEBDAV_PASSWORD_REQUIRED")
    }
    return {
      credentialType: "webdav",
      password,
      accessToken: null,
    }
  }

  if (secrets?.type === "onedrive" && secrets.accessToken) {
    return {
      credentialType: "onedrive",
      password: null,
      accessToken: secrets.accessToken,
    }
  }
  const refreshToken = await readOneDriveRefreshToken(source.id)
  if (!refreshToken) {
    throw new Error("ONEDRIVE_REFRESH_TOKEN_REQUIRED")
  }
  const { accessToken } = await refreshAccessToken(source.id)
  return {
    credentialType: "onedrive",
    password: null,
    accessToken,
  }
}

export async function testRemoteDataSource(
  source: DataSource,
  secrets?: DataSourceSecrets,
): Promise<void> {
  const credential = await credentialFor(source, secrets)
  await MyReaderRustComponents.testRemoteDataSource(
    toNativeDataSource(source),
    credential,
  )
}

export async function listRemoteDirectories(
  source: DataSource,
  path: string,
): Promise<RemoteDirectoryEntry[]> {
  const credential = await credentialFor(source)
  return MyReaderRustComponents.listRemoteDirectories(
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
  return libraryResultFromNative(
    await MyReaderRustComponents.addRemoteLibrary(
      registryPath,
      {
        dataSourceId: source.id,
        sourcePath,
        librariesRootPath: toNativeFilesystemPath(librariesRoot.uri),
        librariesRootUri: librariesRoot.uri,
        name: null,
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
  return libraryResultFromNative(
    await MyReaderRustComponents.refreshRemoteLibrary(
      registryPath,
      library.id,
      toNativeFilesystemPath(libraryContainerRootUri(library.id)),
      credential,
    ),
  )
}
