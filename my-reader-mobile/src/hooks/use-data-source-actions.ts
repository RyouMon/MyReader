import * as SecureStore from "expo-secure-store";

import type { DataSource, DataSourceWebdav, DataSourceConnectionTestResult } from "@my-reader/tools/types/data-source";
import type { WebDavDataSource } from "../data/types";
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

  async function refreshDataSources(id: string) {
    const dataSources = await hydrateDataSourcesFromSecureCredentials(store.getState().dataSources);
    store.getState().setDataSources(dataSources);
  }

  async function createDataSource(source: DataSource): Promise<DataSource> {
    if (source.type !== "webdav") throw new Error("Only webdav data sources are supported");
    const webdav = source as WebDavDataSource;
    await SecureStore.setItemAsync(webdavPasswordKey(webdav.id), webdav.password);

    const { password: _password, ...clean } = webdav;
    const ds: DataSourceWebdav = {
      ...clean,
      hasPassword: true,
    };

    store.getState().upsertDataSource(ds);
    return ds;
  }

  async function updateDataSource(id: string, source: DataSource) {
    if (source.type !== "webdav") return;
    const webdav = source as WebDavDataSource;
    if (webdav.password) {
      await SecureStore.setItemAsync(webdavPasswordKey(id), webdav.password);
    }

    const { password: _password, ...clean } = webdav;
    const ds: DataSourceWebdav = {
      ...clean,
      hasPassword: Boolean(webdav.password),
    };

    store.getState().upsertDataSource(ds);
  }

  async function deleteDataSource(id: string) {
    const source = store.getState().dataSources.find((d) => d.id === id);
    if (source?.type === "webdav") {
      try {
        await SecureStore.deleteItemAsync(webdavPasswordKey(id));
      } catch {
        // key may not exist
      }
    }
    store.getState().removeDataSourceById(id);
  }

  async function testDataSourceConnection(source: DataSource): Promise<DataSourceConnectionTestResult> {
    if (source.type !== "webdav") {
      return { ok: false, message: "Only webdav data sources are supported" };
    }
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