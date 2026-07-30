import type {
  DataSource,
  DataSourceConnectionTestResult,
  DataSourceWebdav,
} from "@my-reader/tools/types/data-source"
import { DataSourceInUseError } from "@/src/errors"
import {
  type DeviceRegistry,
  initializeDeviceRegistry,
  prepareDeviceDataSource,
  removeDeviceDataSource,
  upsertDeviceDataSource,
  validateDeviceDataSource,
} from "@/src/services/core/device-registry"
import { testRemoteDataSource } from "@/src/services/core/remote"
import type { DataSourceSecrets } from "@/src/services/storage/credentials"
import {
  deleteSecrets,
  deriveCredentialFlags,
  hydrateDataSourcesFromSecureCredentials,
  writeSecrets,
} from "@/src/services/storage/credentials"
import { useAppStore } from "@/src/store/app-store"

export function useDataSourceActions() {
  const store = useAppStore

  async function hydrateFromBackend() {
    try {
      const state = store.getState()
      const registry = await initializeDeviceRegistry({
        dataSources: state.dataSources,
        libraries: state.libraries,
        activeLibraryId: state.activeLibraryId,
      })
      const hydrated = await hydrateDataSourcesFromSecureCredentials(
        registry.dataSources,
      )
      const merged = registry.dataSources.map((ds) => {
        const h = hydrated.find((d) => d.id === ds.id)
        return h ? { ...ds, ...h } : ds
      })
      store.getState().setDataSources(merged)
      store.getState().setLibraries(registry.libraries)
      store.getState().setActiveLibraryId(registry.activeLibraryId)
    } finally {
      store.getState().setStoreReady(true)
    }
  }

  async function refreshDataSources() {
    const state = store.getState()
    const registry = await initializeDeviceRegistry({
      dataSources: state.dataSources,
      libraries: state.libraries,
      activeLibraryId: state.activeLibraryId,
    })
    const hydrated = await hydrateDataSourcesFromSecureCredentials(
      registry.dataSources,
    )
    const merged = registry.dataSources.map((ds) => {
      const h = hydrated.find((d) => d.id === ds.id)
      return h ? { ...ds, ...h } : ds
    })
    store.getState().setDataSources(merged)
  }

  async function createDataSource(
    ds: DataSource,
    secrets?: DataSourceSecrets,
  ): Promise<DataSource> {
    const stored = await prepareDeviceDataSource({
      ...ds,
      ...deriveCredentialFlags(secrets),
    })

    await validateDeviceDataSource(stored)
    if (secrets) {
      await writeSecrets(stored.id, secrets)
    }

    const registry = await upsertDeviceDataSource(stored)
    store.getState().setDataSources(registry.dataSources)
    return stored
  }

  async function updateDataSource(
    ds: DataSource,
    secrets?: DataSourceSecrets,
  ): Promise<void> {
    const stored = await prepareDeviceDataSource({
      ...ds,
      ...deriveCredentialFlags(secrets),
    })

    await validateDeviceDataSource(stored)
    if (secrets) {
      await writeSecrets(ds.id, secrets)
    }

    const registry = await upsertDeviceDataSource(stored)
    store.getState().setDataSources(registry.dataSources)
  }

  async function deleteDataSource(id: string) {
    const state = store.getState()
    const ds = state.dataSources.find((d) => d.id === id)
    let registry: DeviceRegistry
    try {
      registry = await removeDeviceDataSource(id)
    } catch (error) {
      const usedByLibraries = state.libraries.filter(
        (library) => library.dataSourceId === id,
      )
      if (
        usedByLibraries.length > 0 &&
        String(error).includes("DATA_SOURCE_IN_USE")
      ) {
        const names = usedByLibraries.map((library) => library.name)
        throw new DataSourceInUseError(names.join("、"), names)
      }
      throw error
    }
    store.getState().setDataSources(registry.dataSources)
    if (ds) {
      await deleteSecrets(id, ds.type)
    }
  }

  async function testDataSourceConnection(
    source: DataSourceWebdav,
    secrets?: DataSourceSecrets,
  ): Promise<DataSourceConnectionTestResult> {
    try {
      await testRemoteDataSource(source, secrets)
      return { ok: true, message: "OK" }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, message: msg }
    }
  }

  return {
    hydrateFromBackend,
    refreshDataSources,
    createDataSource,
    updateDataSource,
    deleteDataSource,
    testDataSourceConnection,
  }
}
