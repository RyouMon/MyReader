import type {
  DataSource,
  DataSourceConnectionTestResult,
  DataSourceWebdav,
} from "@my-reader/tools/types/data-source"
import { DataSourceInUseError } from "@/src/errors"
import {
  type AppConfigSnapshot,
  initializeAppConfig,
  prepareAppDataSource,
  removeAppDataSource,
  upsertAppDataSource,
  validateAppDataSource,
} from "@/src/services/core/app-config"
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
      const config = store.getState()
      const hydrated = await hydrateDataSourcesFromSecureCredentials(
        config.dataSources,
      )
      const merged = config.dataSources.map((ds) => {
        const h = hydrated.find((d) => d.id === ds.id)
        return h ? { ...ds, ...h } : ds
      })
      store.getState().setDataSources(merged)
    } finally {
      store.getState().setStoreReady(true)
    }
  }

  async function refreshDataSources() {
    const config = store.getState()
    const appConfig = await initializeAppConfig({
      dataSources: config.dataSources,
      libraries: config.libraries,
      activeLibraryId: config.activeLibraryId,
    })
    const hydrated = await hydrateDataSourcesFromSecureCredentials(
      appConfig.dataSources,
    )
    const merged = appConfig.dataSources.map((ds) => {
      const h = hydrated.find((d) => d.id === ds.id)
      return h ? { ...ds, ...h } : ds
    })
    store.getState().setDataSources(merged)
  }

  async function createDataSource(
    ds: DataSource,
    secrets?: DataSourceSecrets,
  ): Promise<DataSource> {
    const stored = await prepareAppDataSource({
      ...ds,
      ...deriveCredentialFlags(secrets),
    })

    await validateAppDataSource(stored)
    if (secrets) {
      await writeSecrets(stored.id, secrets)
    }

    const appConfig = await upsertAppDataSource(stored)
    store.getState().setDataSources(appConfig.dataSources)
    return stored
  }

  async function updateDataSource(
    ds: DataSource,
    secrets?: DataSourceSecrets,
  ): Promise<void> {
    const stored = await prepareAppDataSource({
      ...ds,
      ...deriveCredentialFlags(secrets),
    })

    await validateAppDataSource(stored)
    if (secrets) {
      await writeSecrets(ds.id, secrets)
    }

    const appConfig = await upsertAppDataSource(stored)
    store.getState().setDataSources(appConfig.dataSources)
  }

  async function deleteDataSource(id: string) {
    const config = store.getState()
    const ds = config.dataSources.find((d) => d.id === id)
    let appConfig: AppConfigSnapshot
    try {
      appConfig = await removeAppDataSource(id)
    } catch (error) {
      const usedByLibraries = config.libraries.filter(
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
    store.getState().setDataSources(appConfig.dataSources)
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
