import { NetworkError, TimeoutError } from "ky";
import type { DataSource, DataSourceStore } from "@my-reader/tools/store/data-source";
import { testWebDavConnection as probeWebDav } from "../data/webdav";
import { mergeDataSources, persistableDataSources } from "./app-store.constants";
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

async function resolveWebDavPassword(source: DataSource) {
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
    dataSources: [],
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
      const nextPassword = datasource.password ?? "";
      const trimmedUsername = datasource.username.trim();
      const row: DataSource = {
        ...datasource,
        id: datasource.id.trim() ? datasource.id : createWebDavId(),
        name: datasource.name.trim() || "WebDAV",
        endpoint: datasource.endpoint.trim(),
        username: trimmedUsername,
        rootPath: datasource.rootPath?.trim() ? datasource.rootPath.trim() : null,
        password: nextPassword || undefined,
        hasPassword: Boolean(nextPassword),
        createdAt: datasource.createdAt ?? Date.now(),
      };
      if (!trimmedUsername && !nextPassword) {
        await deleteWebDavPassword(row.id);
      } else if (nextPassword) {
        await writeWebDavPassword(row.id, nextPassword);
      } else {
        await deleteWebDavPassword(row.id);
      }
      set((state) => ({
        dataSources: mergeDataSources([...persistableDataSources(state.dataSources), row]),
        error: null,
      }));
      return row;
    },

    async updateDataSource(id: string, datasource: DataSource) {
      let normalized = {
        ...datasource,
        id,
        username: datasource.username.trim(),
      } as DataSource;
      if (typeof normalized.password === "string") {
        if (!normalized.username && !normalized.password) {
          await deleteWebDavPassword(id);
        } else if (normalized.password) {
          await writeWebDavPassword(id, normalized.password);
        } else {
          await deleteWebDavPassword(id);
        }
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
      const context = {
        endpoint: datasource.endpoint?.trim() ?? "",
        rootPath: datasource.rootPath?.trim() ?? "",
        username: datasource.username?.trim() ?? "",
        dataSourceId: datasource.id?.trim() ?? "",
      };
      console.info("[WebDAV][ConnectionTest] Start to test data source connection", context);
      const password = await resolveWebDavPassword(datasource);
      try {
        const response = await probeWebDav({
          ...datasource,
          password,
        }, 3000);
        if (response.ok) {
          console.info("[WebDAV][ConnectionTest] Success to test data source connection", context);
          return { ok: true, message: "OK" } as const;
        }
        let message = "";
        if (response.status === 401 || response.status === 403) {
          message = "认证失败：用户名或密码错误，或当前账号无权限访问该路径。";
        } else if (response.status === 404) {
          message = "路径找不到：请检查基础路径是否正确，以及该路径下是否存在 WebDAV 目录。";
        } else {
          message = `服务器响应异常（HTTP ${response.status}）：请确认服务端状态与 WebDAV 配置。`;
        }
        console.error("[WebDAV][ConnectionTest] Failed to test data source connection", {
          ...context,
          error: message,
        });
        return { ok: false, message } as const;
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        let message = raw;
        if (error instanceof TimeoutError) {
          message = `连接超时：请检查网络、服务器地址、端口和 SSL 配置。原因：${raw}`;
        } else if (error instanceof NetworkError) {
          message = `网络请求失败：无法访问服务器，请检查网络、服务器地址、端口和 SSL 配置。原因：${raw}`;
        }
        console.error("[WebDAV][ConnectionTest] Failed to test data source connection", {
          ...context,
          error: message,
        });
        return {
          ok: false,
          message,
        } as const;
      }
    },
  }) satisfies DataSourceStore;
