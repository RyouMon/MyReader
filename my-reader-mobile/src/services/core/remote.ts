import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { Directory, Paths } from "expo-file-system"
import {
  dataSourceCreateDirectory,
  dataSourceListDirectories,
  dataSourceTestConnection,
  libraryAddRemote,
  libraryCreateRemoteMyreader,
  libraryOpenRemoteMyreader,
  libraryRefreshRemote,
  type RemoteDirectoryEntry as CoreRemoteDirectoryEntry,
} from "my-reader-core"
import { libraryContainerRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"
import type { DataSourceSecrets } from "../storage/credentials"
import { resolveRemoteCredential } from "./remote-credentials"
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

export async function testRemoteDataSource(
  source: DataSource,
  secrets?: DataSourceSecrets,
): Promise<void> {
  const credential = await resolveRemoteCredential(source, secrets)
  await dataSourceTestConnection(toCoreDataSource(source), credential)
}

export async function listRemoteDirectories(
  source: DataSource,
  path: string,
): Promise<RemoteDirectoryEntry[]> {
  const credential = await resolveRemoteCredential(source)
  return dataSourceListDirectories(appConfigPath, source.id, path, credential)
}

export async function createRemoteDirectory(
  source: DataSource,
  parentPath: string,
  name: string,
): Promise<RemoteDirectoryEntry> {
  const credential = await resolveRemoteCredential(source)
  return dataSourceCreateDirectory(
    appConfigPath,
    source.id,
    parentPath,
    name,
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
  const credential = await resolveRemoteCredential(source)
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
  const credential = await resolveRemoteCredential(source)
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
  const credential = await resolveRemoteCredential(source)
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
  const credential = await resolveRemoteCredential(source)
  return libraryResultFromCore(
    await libraryRefreshRemote(
      appConfigPath,
      library.id,
      toNativeFilesystemPath(libraryContainerRootUri(library.id)),
      credential,
    ),
  )
}
