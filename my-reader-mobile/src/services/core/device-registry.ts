import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { File, Paths } from "expo-file-system"
import { toNativeFilesystemPath } from "../fs/path"
import type {
  DataSource_Serialize as CoreDataSource,
  DeviceRegistry_Serialize as CoreDeviceRegistry,
  Library as CoreLibrary,
  LibraryResult_Serialize as CoreLibraryResult,
} from "./contract.generated"
import { invokeCoreAsync } from "./transport"

export type { LibraryResult_Serialize as CoreLibraryResult } from "./contract.generated"

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
      type: "webdav",
      id: source.id,
      name: source.name,
      enabled: source.enabled,
      endpoint: source.endpoint,
      username: source.username,
      rootPath: source.rootPath ?? null,
      hasPassword: source.hasPassword,
      credentialReference: null,
      readonly: source.readonly ?? null,
      createdAt: source.createdAt ?? null,
    }
  }
  return {
    type: "onedrive",
    id: source.id,
    name: source.name,
    enabled: source.enabled,
    clientId: source.clientId,
    tenantId: source.tenantId ?? null,
    displayName: source.displayName ?? null,
    email: source.email ?? null,
    rootPath: source.rootPath ?? null,
    hasRefreshToken: source.hasRefreshToken,
    credentialReference: null,
    readonly: source.readonly ?? null,
    createdAt: source.createdAt ?? null,
  }
}

function dataSourceFromCore(source: CoreDataSource): DataSource | null {
  if (source.type === "webdav") {
    return {
      id: source.id,
      type: "webdav",
      name: source.name,
      enabled: source.enabled,
      endpoint: source.endpoint ?? "",
      username: source.username ?? "",
      rootPath: source.rootPath,
      hasPassword: source.hasPassword ?? false,
      readonly: source.readonly ?? undefined,
      createdAt: source.createdAt ?? undefined,
    }
  }
  if (source.type === "onedrive") {
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
      readonly: source.readonly ?? undefined,
      createdAt: source.createdAt ?? undefined,
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
    metadataUri: library.metadataUri ?? null,
    addedAt: library.addedAt ?? null,
    dataSourceId: library.dataSourceId ?? null,
    sourceType: library.sourceType ?? null,
    sourcePath: library.sourcePath ?? null,
    metadataEtag: library.metadataEtag ?? null,
    securityScopedBookmark: library.securityScopedBookmark ?? null,
  }
}

function libraryFromCore(library: CoreLibrary): Library {
  return {
    id: library.id,
    name: library.name,
    path: library.path,
    bookCount: library.bookCount ?? 0,
    metadataUri: library.metadataUri ?? undefined,
    addedAt: library.addedAt ?? undefined,
    dataSourceId: library.dataSourceId,
    sourceType: library.sourceType,
    sourcePath: library.sourcePath,
    metadataEtag: library.metadataEtag,
    securityScopedBookmark: library.securityScopedBookmark ?? undefined,
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
    activeLibraryId: registry.activeLibraryId,
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
  const registry = await invokeCoreAsync("registry", "initialize", {
    registryPath,
    legacyRegistry: {
      schemaVersion: 1,
      dataSources: legacy.dataSources.map(toCoreDataSource),
      libraries: legacy.libraries.map(toCoreLibrary),
      activeLibraryId: legacy.activeLibraryId,
    },
  })
  return deviceRegistryFromCore(registry)
}

export async function upsertDeviceDataSource(
  source: DataSource,
): Promise<DeviceRegistry> {
  return deviceRegistryFromCore(
    await invokeCoreAsync("registry", "upsertDataSource", {
      registryPath,
      source: toCoreDataSource(source),
    }),
  )
}

export async function prepareDeviceDataSource(
  source: DataSource,
): Promise<DataSource> {
  const prepared = dataSourceFromCore(
    await invokeCoreAsync("registry", "prepareDataSource", {
      source: toCoreDataSource(source),
    }),
  )
  if (!prepared) {
    throw new Error("UNSUPPORTED_DATA_SOURCE_TYPE")
  }
  return prepared
}

export async function validateDeviceDataSource(
  source: DataSource,
): Promise<void> {
  await invokeCoreAsync("registry", "validateDataSource", {
    registryPath,
    source: toCoreDataSource(source),
  })
}

export async function removeDeviceDataSource(
  dataSourceId: string,
): Promise<DeviceRegistry> {
  return deviceRegistryFromCore(
    await invokeCoreAsync("registry", "removeDataSource", {
      registryPath,
      dataSourceId,
    }),
  )
}

export async function registerDeviceLibrary(
  library: Library,
): Promise<DeviceRegistry> {
  return deviceRegistryFromCore(
    await invokeCoreAsync("registry", "registerLibrary", {
      registryPath,
      library: toCoreLibrary(library),
    }),
  )
}

export async function replaceDeviceLibrary(
  library: Library,
): Promise<DeviceRegistry> {
  return deviceRegistryFromCore(
    await invokeCoreAsync("registry", "replaceLibrary", {
      registryPath,
      library: toCoreLibrary(library),
    }),
  )
}

export async function removeDeviceLibrary(
  libraryId: string,
): Promise<DeviceRegistry> {
  return deviceRegistryFromCore(
    await invokeCoreAsync("registry", "removeLibrary", {
      registryPath,
      libraryId,
    }),
  )
}

export async function switchDeviceLibrary(
  libraryId: string,
): Promise<DeviceRegistry> {
  return deviceRegistryFromCore(
    await invokeCoreAsync("registry", "switchLibrary", {
      registryPath,
      libraryId,
    }),
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
    await invokeCoreAsync("registry", "addLocalLibrary", {
      registryPath,
      request: {
        libraryRootPath: toNativeFilesystemPath(request.libraryRootUri),
        path: request.path,
        sidecarContainerParentPath: request.sidecarContainerParentUri
          ? toNativeFilesystemPath(request.sidecarContainerParentUri)
          : null,
        name: request.name ?? null,
        metadataUri: request.metadataUri ?? null,
        addedAt: request.addedAt ?? null,
        securityScopedBookmark: request.securityScopedBookmark ?? null,
      },
    }),
  )
}
