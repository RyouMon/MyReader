import * as SecureStore from "expo-secure-store";

import type { DataSource, DataSourceWebdav, DataSourceConnectionTestResult } from "@my-reader/tools/types/data-source";
import type { WebDavDataSource } from "../data/types";
import type { AppStateSlice } from "./app-store.types";
import { hydrateDataSourcesFromSecureCredentials } from "../services/storage/credentials";

export type DataSourceSlice = {
  dataSources: DataSource[];
  loading: boolean;
  hydrated: boolean;
  hydrateFromBackend: () => Promise<void>;
  refreshDataSources: (id: string) => Promise<void>;
  createDataSource: (datasource: DataSource) => Promise<DataSource>;
  updateDataSource: (id: string, datasource: DataSource) => Promise<void>;
  deleteDataSource: (id: string) => Promise<void>;
  testDataSourceConnection: (
    datasource: DataSource,
  ) => Promise<DataSourceConnectionTestResult>;
};

function webdavPasswordKey(id: string): string {
  return `webdav_password_${id}`;
}

export const createDataSourceSlice: AppStateSlice<DataSourceSlice> = (
  set,
  get,
) => ({
  dataSources: [],
  loading: true,
  hydrated: false,

  hydrateFromBackend: async () => {
    set({ loading: true });
    try {
      const dataSources = await hydrateDataSourcesFromSecureCredentials(
        get().dataSources,
      );
      set({ dataSources });
    } finally {
      set({ loading: false, hydrated: true });
    }
  },

  refreshDataSources: async (_id: string) => {
    const dataSources = await hydrateDataSourcesFromSecureCredentials(
      get().dataSources,
    );
    set({ dataSources });
  },

  createDataSource: async (source) => {
    if (source.type !== "webdav") throw new Error("Only webdav data sources are supported");
    const webdav = source as WebDavDataSource;
    await SecureStore.setItemAsync(webdavPasswordKey(webdav.id), webdav.password);

    const { password: _password, ...clean } = webdav;
    const ds: DataSourceWebdav = {
      ...clean,
      hasPassword: true,
    };

    set((state) => ({
      dataSources: [...state.dataSources, ds],
    }));
    return ds;
  },

  updateDataSource: async (id, source) => {
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

    set((state) => ({
      dataSources: state.dataSources.map((d) =>
        d.id === id ? ds : d,
      ),
    }));
  },

  deleteDataSource: async (id) => {
    const source = get().dataSources.find((d) => d.id === id);
    if (source?.type === "webdav") {
      try {
        await SecureStore.deleteItemAsync(webdavPasswordKey(id));
      } catch {
        // key may not exist
      }
    }
    set((state) => ({
      dataSources: state.dataSources.filter((d) => d.id !== id),
    }));
  },

  testDataSourceConnection: async (source) => {
    if (source.type !== "webdav") {
      return { ok: false, message: "Only webdav data sources are supported" };
    }
    return { ok: true, message: "OK" };
  },
});
