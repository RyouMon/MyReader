import { DataSourceInUseError } from "@/src/errors";
import type { DataSourceSecrets } from "@/src/services/storage/credentials";
import {
  deleteSecrets,
  deriveCredentialFlags,
  hydrateDataSourcesFromSecureCredentials,
  readWebDavPassword,
  writeSecrets,
} from "@/src/services/storage/credentials";
import { useAppStore } from "@/src/store/app-store";
import { uuid } from "@/src/utils/common";
import type { DataSource, DataSourceConnectionTestResult, DataSourceWebdav } from "@my-reader/tools/types/data-source";
import { testConnection as probeWebDav } from "../data/webdav";

export function useDataSourceActions() {
  const store = useAppStore;

  async function hydrateFromBackend() {
    try {
      const dataSources = await hydrateDataSourcesFromSecureCredentials(store.getState().dataSources);
      store.getState().setDataSources(dataSources);
    } finally {
      store.getState().setStoreReady(true);
    }
  }

  async function refreshDataSources() {
    const dataSources = await hydrateDataSourcesFromSecureCredentials(store.getState().dataSources);
    store.getState().setDataSources(dataSources);
  }

  async function createDataSource(
    ds: DataSource,
    secrets?: DataSourceSecrets,
  ): Promise<DataSource> {
    const id = ds.id || uuid();
    const dsWithId = { ...ds, id };

    if (secrets) {
      await writeSecrets(dsWithId.id, secrets);
    }

    const stored: DataSource = {
      ...dsWithId,
      ...deriveCredentialFlags(secrets),
    };

    store.getState().upsertDataSource(stored);
    return stored;
  }

  async function updateDataSource(
    ds: DataSource,
    secrets?: DataSourceSecrets,
  ): Promise<void> {
    if (secrets) {
      await writeSecrets(ds.id, secrets);
    }

    const stored: DataSource = {
      ...ds,
      ...deriveCredentialFlags(secrets),
    };

    store.getState().upsertDataSource(stored);
  }

  async function deleteDataSource(id: string) {
    const state = store.getState();
    const usedByLibraries = state.libraries.filter((l) => l.dataSourceId === id);
    if (usedByLibraries.length > 0) {
      const names = usedByLibraries.map((l) => l.name);
      throw new DataSourceInUseError(names.join("、"), names);
    }
    const ds = state.dataSources.find((d) => d.id === id);
    if (ds) {
      await deleteSecrets(id, ds.type);
    }
    state.removeDataSourceById(id);
  }

  async function testDataSourceConnection(
    source: DataSourceWebdav,
    secrets?: DataSourceSecrets,
  ): Promise<DataSourceConnectionTestResult> {
    try {
      const password = secrets?.type === "webdav" ? secrets.password : (await readWebDavPassword(source.id)) ?? "";
      const response = await probeWebDav({ ...source, password });
      if (response.ok || response.status === 207) {
        return { ok: true, message: "OK" };
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: "Authentication failed" };
      }
      return { ok: false, message: `HTTP ${response.status}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: msg };
    }
  }

  return {
    hydrateFromBackend,
    refreshDataSources,
    createDataSource,
    updateDataSource,
    deleteDataSource,
    testDataSourceConnection,
  };
}
