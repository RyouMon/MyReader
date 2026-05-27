import type { DataSource, DataSourceWebdav, DataSourceConnectionTestResult } from "@my-reader/tools/types/data-source";
import { uuid } from "../utils/common";
import { useAppStore } from "../store/app-store";
import {
  deleteWebDavPassword,
  deleteOneDriveAccessToken,
  deleteOneDriveRefreshToken,
  hydrateDataSourcesFromSecureCredentials,
  writeWebDavPassword,
} from "../services/storage/credentials";

export function useDataSourceActions() {
  const store = useAppStore;

  async function hydrateFromBackend() {
    store.getState().setLoading(true);
    try {
      const dataSources = await hydrateDataSourcesFromSecureCredentials(store.getState().dataSources);
      store.getState().setDataSources(dataSources);
    } finally {
      store.getState().setLoading(false);
      store.getState().setHydrated(true);
    }
  }

  async function refreshDataSources() {
    const dataSources = await hydrateDataSourcesFromSecureCredentials(store.getState().dataSources);
    store.getState().setDataSources(dataSources);
  }

  async function createDataSource(
    ds: DataSource,
    secrets?: { password?: string },
  ): Promise<DataSource> {
    const id = ds.id || uuid();
    const dsWithId = { ...ds, id };

    if (dsWithId.type === "webdav" && secrets?.password) {
      await writeWebDavPassword(dsWithId.id, secrets.password);
    }

    const stored: DataSource = {
      ...dsWithId,
      ...(dsWithId.type === "webdav" ? { hasPassword: Boolean(secrets?.password) } : {}),
    };

    store.getState().upsertDataSource(stored);
    return stored;
  }

  async function updateDataSource(
    ds: DataSource,
    secrets?: { password?: string },
  ): Promise<void> {
    if (ds.type === "webdav" && secrets?.password) {
      await writeWebDavPassword(ds.id, secrets.password);
    }

    const stored: DataSource = {
      ...ds,
      ...(ds.type === "webdav" ? { hasPassword: Boolean(secrets?.password) } : {}),
    };

    store.getState().upsertDataSource(stored);
  }

  async function deleteDataSource(id: string) {
    const state = store.getState();
    const ds = state.dataSources.find((d) => d.id === id);
    if (ds) {
      if (ds.type === "webdav") {
        await deleteWebDavPassword(id);
      } else if (ds.type === "onedrive") {
        await deleteOneDriveAccessToken(id);
        await deleteOneDriveRefreshToken(id);
      }
    }
    state.removeDataSourceById(id);
  }

  async function testDataSourceConnection(
    source: DataSourceWebdav,
    secrets?: { password?: string },
  ): Promise<DataSourceConnectionTestResult> {
    return { ok: true, message: "OK" };
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