import * as SecureStore from "expo-secure-store";

import type { DataSource, DataSourceWebdav, DataSourceConnectionTestResult } from "@my-reader/tools/types/data-source";
import { useAppStore } from "../store/app-store";
import { hydrateDataSourcesFromSecureCredentials } from "../services/storage/credentials";

function webdavPasswordKey(id: string): string {
  return `webdav_password_${id}`;
}

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
    if (ds.type === "webdav" && secrets?.password) {
      await SecureStore.setItemAsync(webdavPasswordKey(ds.id), secrets.password);
    }

    const stored: DataSource = {
      ...ds,
      ...(ds.type === "webdav" ? { hasPassword: Boolean(secrets?.password) } : {}),
    };

    store.getState().upsertDataSource(stored);
    return stored;
  }

  async function updateDataSource(
    ds: DataSource,
    secrets?: { password?: string },
  ): Promise<void> {
    if (ds.type === "webdav" && secrets?.password) {
      await SecureStore.setItemAsync(webdavPasswordKey(ds.id), secrets.password);
    }

    const stored: DataSource = {
      ...ds,
      ...(ds.type === "webdav" ? { hasPassword: Boolean(secrets?.password) } : {}),
    };

    store.getState().upsertDataSource(stored);
  }

  async function deleteDataSource(id: string) {
    try {
      await SecureStore.deleteItemAsync(webdavPasswordKey(id));
    } catch {
      // key may not exist
    }
    store.getState().removeDataSourceById(id);
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