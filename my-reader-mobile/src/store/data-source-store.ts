import { useMemo } from "react";

import type { DataSource, DataSourceStore } from "my-reader-tools/store/data-source";
import { testWebDavConnection as probeWebDav } from "../data/webdav";
import { useAppStore } from "./app-store";
import {
  BUILT_IN_LOCAL_SOURCE,
  BUILT_IN_LOCAL_SOURCE_ID,
  mergeDataSources,
  persistableDataSources,
} from "./app-store.constants";
import type { AppState, AppStateSlice } from "./app-store.types";
import {
  deleteWebDavPassword,
  hydrateDataSourcesFromSecureCredentials,
  readWebDavPassword,
  writeWebDavPassword,
} from "./secure-credential-store";

function createWebDavId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 优先使用传入密码；缺失时尝试从安全存储读取。
 */
async function resolveWebDavPassword(source: DataSource) {
  if (source.type !== "webdav") {
    return "";
  }
  if (typeof source.password === "string" && source.password.length > 0) {
    return source.password;
  }
  if (!source.id) {
    return "";
  }
  return (await readWebDavPassword(source.id)) ?? "";
}

type DataSourceSlice = Pick<AppState, keyof DataSourceStore>;

export const createDataSourceSlice: AppStateSlice<DataSourceSlice> = (set, get) =>
  ({
    dataSources: [BUILT_IN_LOCAL_SOURCE],
    loading: false,
    hydrated: false,

    async hydrateFromBackend() {
      set({ loading: true });
      try {
        const hydratedSources = await hydrateDataSourcesFromSecureCredentials(get().dataSources);
        set({
          dataSources: mergeDataSources(hydratedSources),
          hydrated: true,
          loading: false,
        });
      } catch {
        set({ hydrated: true, loading: false });
      }
    },

    async refreshDataSources(_id: string) {},

    async createDataSource(datasource: DataSource) {
      if (datasource.type === "local") {
        throw new Error("移动端不支持通过此接口添加本地目录数据源。");
      }
      if (datasource.type === "webdav") {
        const nextPassword = datasource.password ?? "";
        const row: DataSource = {
          ...datasource,
          id: datasource.id.trim() ? datasource.id : createWebDavId(),
          name: datasource.name.trim() || "WebDAV",
          endpoint: datasource.endpoint.trim(),
          username: datasource.username.trim(),
          rootPath: datasource.rootPath?.trim() ? datasource.rootPath.trim() : null,
          password: nextPassword || undefined,
          hasPassword: Boolean(nextPassword),
          createdAt: datasource.createdAt ?? Date.now(),
        };
        await writeWebDavPassword(row.id, nextPassword);
        set((state) => ({
          dataSources: mergeDataSources([...persistableDataSources(state.dataSources), row]),
          error: null,
        }));
        return row;
      }
      throw new Error("不支持的数据源类型");
    },

    async updateDataSource(id: string, datasource: DataSource) {
      let normalized = { ...datasource, id } as DataSource;
      if (normalized.type === "webdav") {
        if (typeof normalized.password === "string") {
          await writeWebDavPassword(id, normalized.password);
          normalized = {
            ...normalized,
            password: normalized.password || undefined,
            hasPassword: Boolean(normalized.password),
          };
        } else {
          const securePassword = await readWebDavPassword(id);
          normalized = {
            ...normalized,
            password: securePassword ?? undefined,
            hasPassword: Boolean(securePassword),
          };
        }
      }
      set((state) => {
        const next = state.dataSources.map((item) => {
          if (item.id !== id) {
            return item;
          }
          return normalized;
        });
        return {
          dataSources: mergeDataSources(next),
          error: null,
        };
      });
    },

    async deleteDataSource(id: string) {
      const state = get();

      if (id === BUILT_IN_LOCAL_SOURCE_ID) {
        throw new Error("内置手机数据源不能删除");
      }

      if (state.libraries.some((library) => library.dataSourceId === id)) {
        throw new Error("请先移除使用该数据源的书库");
      }

      await deleteWebDavPassword(id);
      set({
        dataSources: mergeDataSources(
          persistableDataSources(state.dataSources).filter((source) => source.id !== id)
        ),
        error: null,
      });
    },

    async testDataSourceConnection(datasource: DataSource) {
      if (datasource.type !== "webdav") {
        return;
      }
      const password = await resolveWebDavPassword(datasource);
      if (!password) {
        throw new Error("请输入 WebDAV 密码后再测试连接。");
      }
      await probeWebDav({
        ...datasource,
        password,
      });
    },
  }) satisfies DataSourceStore;

export function useDataSourceStore() {
  const dataSources = useAppStore((state) => state.dataSources);
  const loading = useAppStore((state) => state.loading);
  const hydrated = useAppStore((state) => state.hydrated);
  const hydrateFromBackend = useAppStore((state) => state.hydrateFromBackend);
  const refreshDataSources = useAppStore((state) => state.refreshDataSources);
  const createDataSource = useAppStore((state) => state.createDataSource);
  const updateDataSource = useAppStore((state) => state.updateDataSource);
  const deleteDataSource = useAppStore((state) => state.deleteDataSource);
  const testDataSourceConnection = useAppStore((state) => state.testDataSourceConnection);

  return useMemo(
    () => ({
      dataSources,
      loading,
      hydrated,
      hydrateFromBackend,
      refreshDataSources,
      createDataSource,
      updateDataSource,
      deleteDataSource,
      testDataSourceConnection,
    }),
    [
      dataSources,
      loading,
      hydrated,
      hydrateFromBackend,
      refreshDataSources,
      createDataSource,
      updateDataSource,
      deleteDataSource,
      testDataSourceConnection,
    ]
  );
}
