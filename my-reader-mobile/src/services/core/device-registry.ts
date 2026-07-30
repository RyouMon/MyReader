import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { File, Paths } from "expo-file-system"
import MyReaderRustComponents, {
  type NativeDataSource,
  type NativeDeviceRegistry,
  type NativeLibrary,
  type NativeLibraryResult,
} from "@/modules/myreader-rust-components"
import { toNativeFilesystemPath } from "../fs/path"

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

export function toNativeDataSource(source: DataSource): NativeDataSource {
  return {
    sourceType: source.type,
    id: source.id,
    name: source.name,
    enabled: source.enabled,
    rootPath: source.rootPath ?? null,
    readonly: source.readonly ?? null,
    createdAt: source.createdAt ?? null,
    endpoint: source.type === "webdav" ? source.endpoint : null,
    username: source.type === "webdav" ? source.username : null,
    hasPassword: source.type === "webdav" && source.hasPassword,
    credentialReference: null,
    clientId: source.type === "onedrive" ? source.clientId : null,
    tenantId: source.type === "onedrive" ? (source.tenantId ?? null) : null,
    displayName:
      source.type === "onedrive" ? (source.displayName ?? null) : null,
    email: source.type === "onedrive" ? (source.email ?? null) : null,
    hasRefreshToken: source.type === "onedrive" && source.hasRefreshToken,
  }
}

function dataSourceFromNative(source: NativeDataSource): DataSource | null {
  if (source.sourceType === "webdav") {
    return {
      id: source.id,
      type: "webdav",
      name: source.name,
      enabled: source.enabled,
      endpoint: source.endpoint ?? "",
      username: source.username ?? "",
      rootPath: source.rootPath,
      hasPassword: source.hasPassword,
      readonly: source.readonly ?? undefined,
      createdAt: source.createdAt ?? undefined,
    }
  }
  if (source.sourceType === "onedrive") {
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
      hasRefreshToken: source.hasRefreshToken,
      readonly: source.readonly ?? undefined,
      createdAt: source.createdAt ?? undefined,
    }
  }
  return null
}

export function toNativeLibrary(library: Library): NativeLibrary {
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

function libraryFromNative(library: NativeLibrary): Library {
  return {
    id: library.id,
    name: library.name,
    path: library.path,
    bookCount: library.bookCount,
    metadataUri: library.metadataUri ?? undefined,
    addedAt: library.addedAt ?? undefined,
    dataSourceId: library.dataSourceId,
    sourceType: library.sourceType,
    sourcePath: library.sourcePath,
    metadataEtag: library.metadataEtag,
    securityScopedBookmark: library.securityScopedBookmark ?? undefined,
  }
}

export function deviceRegistryFromNative(
  registry: NativeDeviceRegistry,
): DeviceRegistry {
  return {
    schemaVersion: registry.schemaVersion,
    dataSources: registry.dataSources
      .map(dataSourceFromNative)
      .filter((source): source is DataSource => source !== null),
    libraries: registry.libraries.map(libraryFromNative),
    activeLibraryId: registry.activeLibraryId,
  }
}

export function libraryResultFromNative(
  result: NativeLibraryResult,
): LocalLibraryResult {
  return {
    registry: deviceRegistryFromNative(result.registry),
    library: libraryFromNative(result.library),
  }
}

export async function initializeDeviceRegistry(legacy: {
  dataSources: DataSource[]
  libraries: Library[]
  activeLibraryId: string | null
}): Promise<DeviceRegistry> {
  return deviceRegistryFromNative(
    await MyReaderRustComponents.initializeDeviceRegistry(registryPath, {
      schemaVersion: 1,
      dataSources: legacy.dataSources.map(toNativeDataSource),
      libraries: legacy.libraries.map(toNativeLibrary),
      activeLibraryId: legacy.activeLibraryId,
    }),
  )
}

export async function upsertDeviceDataSource(
  source: DataSource,
): Promise<DeviceRegistry> {
  return deviceRegistryFromNative(
    await MyReaderRustComponents.upsertDeviceDataSource(
      registryPath,
      toNativeDataSource(source),
    ),
  )
}

export async function prepareDeviceDataSource(
  source: DataSource,
): Promise<DataSource> {
  const prepared = dataSourceFromNative(
    await MyReaderRustComponents.prepareDeviceDataSource(
      toNativeDataSource(source),
    ),
  )
  if (!prepared) {
    throw new Error("UNSUPPORTED_DATA_SOURCE_TYPE")
  }
  return prepared
}

export async function validateDeviceDataSource(
  source: DataSource,
): Promise<void> {
  await MyReaderRustComponents.validateDeviceDataSource(
    registryPath,
    toNativeDataSource(source),
  )
}

export async function removeDeviceDataSource(
  dataSourceId: string,
): Promise<DeviceRegistry> {
  return deviceRegistryFromNative(
    await MyReaderRustComponents.removeDeviceDataSource(
      registryPath,
      dataSourceId,
    ),
  )
}

export async function registerDeviceLibrary(
  library: Library,
): Promise<DeviceRegistry> {
  return deviceRegistryFromNative(
    await MyReaderRustComponents.registerDeviceLibrary(
      registryPath,
      toNativeLibrary(library),
    ),
  )
}

export async function replaceDeviceLibrary(
  library: Library,
): Promise<DeviceRegistry> {
  return deviceRegistryFromNative(
    await MyReaderRustComponents.replaceDeviceLibrary(
      registryPath,
      toNativeLibrary(library),
    ),
  )
}

export async function removeDeviceLibrary(
  libraryId: string,
): Promise<DeviceRegistry> {
  return deviceRegistryFromNative(
    await MyReaderRustComponents.removeDeviceLibrary(registryPath, libraryId),
  )
}

export async function switchDeviceLibrary(
  libraryId: string,
): Promise<DeviceRegistry> {
  return deviceRegistryFromNative(
    await MyReaderRustComponents.switchDeviceLibrary(registryPath, libraryId),
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
  return libraryResultFromNative(
    await MyReaderRustComponents.addLocalLibrary(registryPath, {
      libraryRootPath: toNativeFilesystemPath(request.libraryRootUri),
      path: request.path,
      sidecarContainerParentPath: request.sidecarContainerParentUri
        ? toNativeFilesystemPath(request.sidecarContainerParentUri)
        : null,
      name: request.name ?? null,
      metadataUri: request.metadataUri ?? null,
      addedAt: request.addedAt ?? null,
      securityScopedBookmark: request.securityScopedBookmark ?? null,
    }),
  )
}
