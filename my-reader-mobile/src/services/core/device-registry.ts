import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { File, Paths } from "expo-file-system"
import {
  registryAddLocalLibrary,
  registryInitialize,
  registryPrepareDataSource,
  registryRegisterLibrary,
  registryRemoveDataSource,
  registryRemoveLibrary,
  registryReplaceLibrary,
  registrySwitchLibrary,
  registryUpsertDataSource,
  registryValidateDataSource,
  type DataSource as CoreDataSource,
  type DeviceRegistry as CoreDeviceRegistry,
  type Library as CoreLibrary,
  type LibraryResult as CoreLibraryResult,
} from "my-reader-core"
import { toNativeFilesystemPath } from "../fs/path"

export type { LibraryResult as CoreLibraryResult } from "my-reader-core"

export type DeviceRegistry = {
  schemaVersion: number
  dataSources: DataSource[]
  libraries: Library[]
  activeLibraryId: string | null
}

export type LocalLibraryResult = {
  registry: DeviceRegistry
  library: Library
}

const registryPath = toNativeFilesystemPath(
  new File(Paths.document, "device-registry.json").uri,
)

export function toCoreDataSource(source: DataSource): CoreDataSource {
  if (source.type === "webdav") {
    return {
      kind: "webdav",
      id: source.id,
      name: source.name,
      enabled: source.enabled,
      endpoint: source.endpoint,
      username: source.username,
      rootPath: source.rootPath ?? undefined,
      hasPassword: source.hasPassword,
      readonly: source.readonly,
      createdAt: source.createdAt,
    }
  }
  return {
    kind: "onedrive",
    id: source.id,
    name: source.name,
    enabled: source.enabled,
    clientId: source.clientId,
    tenantId: source.tenantId ?? undefined,
    displayName: source.displayName ?? undefined,
    email: source.email ?? undefined,
    rootPath: source.rootPath ?? undefined,
    hasRefreshToken: source.hasRefreshToken,
    readonly: source.readonly,
    createdAt: source.createdAt,
  }
}

function dataSourceFromCore(source: CoreDataSource): DataSource | null {
  if (source.kind === "webdav") {
    return {
      id: source.id,
      type: "webdav",
      name: source.name,
      enabled: source.enabled,
      endpoint: source.endpoint ?? "",
      username: source.username ?? "",
      rootPath: source.rootPath,
      hasPassword: source.hasPassword ?? false,
      readonly: source.readonly,
      createdAt: source.createdAt,
    }
  }
  if (source.kind === "onedrive") {
    return {
      id: source.id,
      type: "onedrive",
      name: source.name,
      enabled: source.enabled,
      clientId: source.clientId ?? "",
      tenantId: source.tenantId,
      displayName: source.displayName,
      email: source.email,
      rootPath: source.rootPath,
      hasRefreshToken: source.hasRefreshToken ?? false,
      readonly: source.readonly,
      createdAt: source.createdAt,
    }
  }
  return null
}

export function toCoreLibrary(library: Library): CoreLibrary {
  return {
    id: library.id,
    name: library.name,
    path: library.path,
    bookCount: library.bookCount,
    metadataUri: library.metadataUri,
    addedAt: library.addedAt,
    dataSourceId: library.dataSourceId ?? undefined,
    sourceType: library.sourceType ?? undefined,
    sourcePath: library.sourcePath ?? undefined,
    metadataEtag: library.metadataEtag ?? undefined,
    securityScopedBookmark: library.securityScopedBookmark,
  }
}

function libraryFromCore(library: CoreLibrary): Library {
  return {
    id: library.id,
    name: library.name,
    path: library.path,
    bookCount: library.bookCount,
    metadataUri: library.metadataUri,
    addedAt: library.addedAt,
    dataSourceId: library.dataSourceId,
    sourceType: library.sourceType,
    sourcePath: library.sourcePath,
    metadataEtag: library.metadataEtag,
    securityScopedBookmark: library.securityScopedBookmark,
  }
}

export function deviceRegistryFromCore(
  registry: CoreDeviceRegistry,
): DeviceRegistry {
  return {
    schemaVersion: registry.schemaVersion,
    dataSources: registry.dataSources
      .map(dataSourceFromCore)
      .filter((source): source is DataSource => source !== null),
    libraries: registry.libraries.map(libraryFromCore),
    activeLibraryId: registry.activeLibraryId ?? null,
  }
}

export function libraryResultFromCore(
  result: CoreLibraryResult,
): LocalLibraryResult {
  return {
    registry: deviceRegistryFromCore(result.registry),
    library: libraryFromCore(result.library),
  }
}

export async function initializeDeviceRegistry(legacy: {
  dataSources: DataSource[]
  libraries: Library[]
  activeLibraryId: string | null
}): Promise<DeviceRegistry> {
  const registry = await registryInitialize(registryPath, {
    schemaVersion: 1,
    dataSources: legacy.dataSources.map(toCoreDataSource),
    libraries: legacy.libraries.map(toCoreLibrary),
    activeLibraryId: legacy.activeLibraryId ?? undefined,
  })
  return deviceRegistryFromCore(registry)
}

export async function upsertDeviceDataSource(
  source: DataSource,
): Promise<DeviceRegistry> {
  return deviceRegistryFromCore(
    await registryUpsertDataSource(registryPath, toCoreDataSource(source)),
  )
}

export async function prepareDeviceDataSource(
  source: DataSource,
): Promise<DataSource> {
  const prepared = dataSourceFromCore(
    await registryPrepareDataSource(toCoreDataSource(source)),
  )
  if (!prepared) {
    throw new Error("UNSUPPORTED_DATA_SOURCE_TYPE")
  }
  return prepared
}

export async function validateDeviceDataSource(
  source: DataSource,
): Promise<void> {
  await registryValidateDataSource(registryPath, toCoreDataSource(source))
}

export async function removeDeviceDataSource(
  dataSourceId: string,
): Promise<DeviceRegistry> {
  return deviceRegistryFromCore(
    await registryRemoveDataSource(registryPath, dataSourceId),
  )
}

export async function registerDeviceLibrary(
  library: Library,
): Promise<DeviceRegistry> {
  return deviceRegistryFromCore(
    await registryRegisterLibrary(registryPath, toCoreLibrary(library)),
  )
}

export async function replaceDeviceLibrary(
  library: Library,
): Promise<DeviceRegistry> {
  return deviceRegistryFromCore(
    await registryReplaceLibrary(registryPath, toCoreLibrary(library)),
  )
}

export async function removeDeviceLibrary(
  libraryId: string,
): Promise<DeviceRegistry> {
  return deviceRegistryFromCore(
    await registryRemoveLibrary(registryPath, libraryId),
  )
}

export async function switchDeviceLibrary(
  libraryId: string,
): Promise<DeviceRegistry> {
  return deviceRegistryFromCore(
    await registrySwitchLibrary(registryPath, libraryId),
  )
}

export async function addLocalDeviceLibrary(request: {
  libraryRootUri: string
  path: string
  sidecarContainerParentUri?: string
  name?: string
  metadataUri?: string
  addedAt?: number
  securityScopedBookmark?: Library["securityScopedBookmark"]
}): Promise<LocalLibraryResult> {
  return libraryResultFromCore(
    await registryAddLocalLibrary(registryPath, {
      libraryRootPath: toNativeFilesystemPath(request.libraryRootUri),
      path: request.path,
      sidecarContainerParentPath: request.sidecarContainerParentUri
        ? toNativeFilesystemPath(request.sidecarContainerParentUri)
        : undefined,
      name: request.name,
      metadataUri: request.metadataUri,
      addedAt: request.addedAt,
      securityScopedBookmark: request.securityScopedBookmark,
    }),
  )
}
