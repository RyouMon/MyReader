import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { File, Paths } from "expo-file-system"
import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { toNativeFilesystemPath } from "../fs/path"

export type DeviceRegistry = {
  schemaVersion: number
  dataSources: DataSource[]
  libraries: Library[]
  activeLibraryId: string | null
}

const registryPath = toNativeFilesystemPath(
  new File(Paths.document, "device-registry.json").uri,
)

function parseRegistry(json: string): DeviceRegistry {
  return JSON.parse(json) as DeviceRegistry
}

export async function initializeDeviceRegistry(legacy: {
  dataSources: DataSource[]
  libraries: Library[]
  activeLibraryId: string | null
}): Promise<DeviceRegistry> {
  return parseRegistry(
    await MyReaderRustComponents.initializeDeviceRegistry(
      registryPath,
      JSON.stringify({
        schemaVersion: 1,
        ...legacy,
      }),
    ),
  )
}

export async function upsertDeviceDataSource(
  source: DataSource,
): Promise<DeviceRegistry> {
  return parseRegistry(
    await MyReaderRustComponents.upsertDeviceDataSource(
      registryPath,
      JSON.stringify(source),
    ),
  )
}

export async function validateDeviceDataSource(
  source: DataSource,
): Promise<void> {
  await MyReaderRustComponents.validateDeviceDataSource(
    registryPath,
    JSON.stringify(source),
  )
}

export async function removeDeviceDataSource(
  dataSourceId: string,
): Promise<DeviceRegistry> {
  return parseRegistry(
    await MyReaderRustComponents.removeDeviceDataSource(
      registryPath,
      dataSourceId,
    ),
  )
}

export async function registerDeviceLibrary(
  library: Library,
): Promise<DeviceRegistry> {
  return parseRegistry(
    await MyReaderRustComponents.registerDeviceLibrary(
      registryPath,
      JSON.stringify(library),
    ),
  )
}

export async function replaceDeviceLibrary(
  library: Library,
): Promise<DeviceRegistry> {
  return parseRegistry(
    await MyReaderRustComponents.replaceDeviceLibrary(
      registryPath,
      JSON.stringify(library),
    ),
  )
}

export async function removeDeviceLibrary(
  libraryId: string,
): Promise<DeviceRegistry> {
  return parseRegistry(
    await MyReaderRustComponents.removeDeviceLibrary(registryPath, libraryId),
  )
}

export async function switchDeviceLibrary(
  libraryId: string,
): Promise<DeviceRegistry> {
  return parseRegistry(
    await MyReaderRustComponents.switchDeviceLibrary(registryPath, libraryId),
  )
}
