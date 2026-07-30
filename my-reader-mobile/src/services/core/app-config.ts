import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { File, Paths } from "expo-file-system"
import {
  appConfigInitialize,
  appConfigWriteMobile,
  dataSourcePrepareForUpsert,
  dataSourceRemove,
  dataSourceUpsert,
  libraryAddLocal,
  libraryRemove,
  libraryReplace,
  librarySwitch,
  type AppConfig as CoreAppConfig,
  type DataSource as CoreDataSource,
  type Library as CoreLibrary,
  type LibraryResult as CoreLibraryResult,
} from "my-reader-core"
import { toNativeFilesystemPath } from "../fs/path"

export type { LibraryResult as CoreLibraryResult } from "my-reader-core"

export type AppConfigSnapshot = {
  schemaVersion: number
  deviceId: string | null
  preferences: {
    theme: string
    language: string
  }
  dataSources: DataSource[]
  libraries: Library[]
  activeLibraryId: string | null
  mobileJson: string | null
}

export type LocalLibraryResult = {
  config: AppConfigSnapshot
  library: Library
}

export const appConfigPath = toNativeFilesystemPath(
  new File(Paths.document, "config.json").uri,
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

export function appConfigFromCore(config: CoreAppConfig): AppConfigSnapshot {
  return {
    schemaVersion: config.schemaVersion,
    deviceId: config.deviceId ?? null,
    preferences: config.preferences,
    dataSources: config.dataSources
      .map(dataSourceFromCore)
      .filter((source): source is DataSource => source !== null),
    libraries: config.libraries.map(libraryFromCore),
    activeLibraryId: config.activeLibraryId ?? null,
    mobileJson: config.mobileJson ?? null,
  }
}

export function libraryResultFromCore(
  result: CoreLibraryResult,
): LocalLibraryResult {
  return {
    config: appConfigFromCore(result.config),
    library: libraryFromCore(result.library),
  }
}

export async function initializeAppConfig(initial: {
  dataSources: DataSource[]
  libraries: Library[]
  activeLibraryId: string | null
  preferences?: AppConfigSnapshot["preferences"]
  mobileJson?: string | null
}): Promise<AppConfigSnapshot> {
  const config = await appConfigInitialize(appConfigPath, {
    schemaVersion: 1,
    deviceId: undefined,
    preferences: initial.preferences ?? {
      theme: "system",
      language: "system",
    },
    dataSources: initial.dataSources.map(toCoreDataSource),
    libraries: initial.libraries.map(toCoreLibrary),
    activeLibraryId: initial.activeLibraryId ?? undefined,
    mobileJson: initial.mobileJson ?? undefined,
  })
  return appConfigFromCore(config)
}

export async function writeMobileAppConfig(
  preferences: AppConfigSnapshot["preferences"],
  mobileJson: string | null,
): Promise<AppConfigSnapshot> {
  return appConfigFromCore(
    await appConfigWriteMobile(
      appConfigPath,
      preferences,
      mobileJson ?? undefined,
    ),
  )
}

export async function upsertAppDataSource(
  source: DataSource,
): Promise<AppConfigSnapshot> {
  return appConfigFromCore(
    await dataSourceUpsert(appConfigPath, toCoreDataSource(source)),
  )
}

export async function prepareAppDataSourceForUpsert(
  source: DataSource,
): Promise<DataSource> {
  const prepared = dataSourceFromCore(
    await dataSourcePrepareForUpsert(appConfigPath, toCoreDataSource(source)),
  )
  if (!prepared) {
    throw new Error("UNSUPPORTED_DATA_SOURCE_TYPE")
  }
  return prepared
}

export async function removeAppDataSource(
  dataSourceId: string,
): Promise<AppConfigSnapshot> {
  return appConfigFromCore(await dataSourceRemove(appConfigPath, dataSourceId))
}

export async function replaceAppLibrary(
  library: Library,
): Promise<AppConfigSnapshot> {
  return appConfigFromCore(
    await libraryReplace(appConfigPath, toCoreLibrary(library)),
  )
}

export async function removeAppLibrary(
  libraryId: string,
): Promise<AppConfigSnapshot> {
  return appConfigFromCore(await libraryRemove(appConfigPath, libraryId))
}

export async function switchAppLibrary(
  libraryId: string,
): Promise<AppConfigSnapshot> {
  return appConfigFromCore(await librarySwitch(appConfigPath, libraryId))
}

export async function addLocalAppLibrary(request: {
  libraryRootUri: string
  path: string
  sidecarContainerParentUri?: string
  name?: string
  metadataUri?: string
  addedAt?: number
  securityScopedBookmark?: Library["securityScopedBookmark"]
}): Promise<LocalLibraryResult> {
  return libraryResultFromCore(
    await libraryAddLocal(appConfigPath, {
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
