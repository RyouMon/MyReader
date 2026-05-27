import type { DataSource, DataSourceStore } from "@my-reader/tools/store/data-source";
import { NetworkError, TimeoutError } from "ky";
import { testConnection as probeWebDav } from "../data/webdav";
import { testConnection as probeOneDrive } from "../data/onedrive";
import { mergeDataSources, persistableDataSources } from "./app-store.constants";
import type { AppState, AppStateSlice } from "./app-store.types";
import {
    deleteWebDavPassword,
    deleteOneDriveAccessToken,
    deleteOneDriveRefreshToken,
    hydrateDataSourcesFromSecureCredentials,
    readWebDavPassword,
    writeWebDavPassword,
} from "../services/storage/credentials";

import i18n from "@/src/i18n";

function createDataSourceId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function resolveWebDavPassword(source: DataSource) {
  if (source.type !== "webdav") return "";
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
      const id = datasource.id.trim() ? datasource.id : createDataSourceId();
      const rootPath = datasource.rootPath?.trim() ? datasource.rootPath.trim() : null;
      const createdAt = datasource.createdAt ?? Date.now();

      if (datasource.type === "webdav") {
        const nextPassword = datasource.password ?? "";
        const trimmedUsername = datasource.username.trim();
        const webdavRow: DataSource = {
          ...datasource,
          id,
          name: datasource.name.trim() || "WebDAV",
          rootPath,
          createdAt,
          endpoint: datasource.endpoint.trim(),
          username: trimmedUsername,
          password: nextPassword || undefined,
          hasPassword: Boolean(nextPassword),
        };
        if (!trimmedUsername && !nextPassword) {
          await deleteWebDavPassword(webdavRow.id);
        } else if (nextPassword) {
          await writeWebDavPassword(webdavRow.id, nextPassword);
        } else {
          await deleteWebDavPassword(webdavRow.id);
        }
        set((state) => ({
          dataSources: mergeDataSources([...persistableDataSources(state.dataSources), webdavRow]),
          error: null,
        }));
        return webdavRow;
      }

      // OneDrive: tokens are already in SecureStore from the auth flow
      const row: DataSource = {
        ...datasource,
        id,
        name: datasource.name.trim() || "OneDrive",
        rootPath,
        createdAt,
      };
      set((state) => ({
        dataSources: mergeDataSources([...persistableDataSources(state.dataSources), row]),
        error: null,
      }));
      return row;
    },

    async updateDataSource(id: string, datasource: DataSource) {
      if (datasource.type === "webdav") {
        const normalized: DataSource & { type: "webdav" } = {
          ...datasource,
          id,
          username: datasource.username.trim(),
        };
        if (typeof normalized.password === "string") {
          if (!normalized.username && !normalized.password) {
            await deleteWebDavPassword(id);
          } else if (normalized.password) {
            await writeWebDavPassword(id, normalized.password);
          } else {
            await deleteWebDavPassword(id);
          }
          const withPassword: DataSource = {
            ...normalized,
            password: normalized.password || undefined,
            hasPassword: Boolean(normalized.password),
          };
          set((state) => {
            const next = state.dataSources.map((item) =>
              item.id !== id ? item : withPassword,
            );
            return { dataSources: mergeDataSources(next), error: null };
          });
          return;
        }
        const securePassword = await readWebDavPassword(id);
        const resolved: DataSource = {
          ...normalized,
          password: securePassword ?? undefined,
          hasPassword: Boolean(securePassword),
        };
        set((state) => {
          const next = state.dataSources.map((item) =>
            item.id !== id ? item : resolved,
          );
          return { dataSources: mergeDataSources(next), error: null };
        });
        return;
      }

      // OneDrive: tokens live in SecureStore, just persist the record
      set((state) => {
        const next = state.dataSources.map((item) =>
          item.id !== id ? item : { ...datasource, id },
        );
        return { dataSources: mergeDataSources(next), error: null };
      });
    },

    async deleteDataSource(id: string) {
      const state = get();

      if (state.libraries.some((library) => library.dataSourceId === id)) {
        throw new Error(i18n.t("sync.removeLibraryFirst"));
      }

      const source = state.dataSources.find((s) => s.id === id);
      if (source?.type === "webdav") {
        await deleteWebDavPassword(id);
      } else if (source?.type === "onedrive") {
        await deleteOneDriveAccessToken(id);
        await deleteOneDriveRefreshToken(id);
      }

      set({
        dataSources: mergeDataSources(
          persistableDataSources(state.dataSources).filter((s) => s.id !== id)
        ),
        error: null,
      });
    },

    async testDataSourceConnection(datasource: DataSource) {
      if (datasource.type === "onedrive") {
        try {
          const response = await probeOneDrive(datasource.id);
          if (response.ok) {
            return { ok: true, message: "OK" } as const;
          }
          const message = response.status === 401
            ? i18n.t("sync.authFailed")
            : i18n.t("sync.serverAbnormal", { status: response.status });
          return { ok: false, message } as const;
        } catch (error) {
          const raw = error instanceof Error ? error.message : String(error);
          return { ok: false, message: raw } as const;
        }
      }

      // WebDAV
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
        } as import("../data/types").WebDavDataSource, 3000);
        if (response.ok) {
          console.info("[WebDAV][ConnectionTest] Success to test data source connection", context);
          return { ok: true, message: "OK" } as const;
        }
        let message = "";
        if (response.status === 401 || response.status === 403) {
          message = i18n.t("sync.authFailed");
        } else if (response.status === 404) {
          message = i18n.t("sync.pathNotFound");
        } else {
          message = i18n.t("sync.serverAbnormal", { status: response.status });
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
          message = i18n.t("sync.connectionTimeoutDetail", { reason: raw });
        } else if (error instanceof NetworkError) {
          message = i18n.t("sync.networkFailed", { reason: raw });
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
