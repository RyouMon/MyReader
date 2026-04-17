import type { DataSourceLocal } from "my-reader-tools/store/data-source";
import type { DataSource } from "../data/types";
import { stripSensitiveDataSources } from "./secure-credential-store";

import type { ReaderSettings } from "./app-store.types";

export const BUILT_IN_LOCAL_SOURCE_ID = "device-local";
export const STORE_NAME = "myreader-mobile-app-state";

export const BUILT_IN_LOCAL_SOURCE: DataSourceLocal = {
  id: BUILT_IN_LOCAL_SOURCE_ID,
  type: "local",
  name: "手机",
  enabled: true,
  createdAt: 0,
};

export const defaultSettings: ReaderSettings = {
  themeMode: "system",
  syncEnabled: true,
  cache: {
    maxCacheSizeMB: 2048,
  },
  reflowable: {
    theme: "paper",
    fontSize: 18,
    lineHeight: 1.85,
    paddingX: 20,
    readingLayout: "scroll",
    brightness: 100,
  },
  fixed: {
    theme: "dark",
    readingLayout: "paginate",
    navigationMode: "horizontal",
    brightness: 100,
    zoomScale: 1,
  },
};

export function mergeDataSources(dataSources: DataSource[]) {
  const withoutBuiltIn = dataSources.filter((source) => source.id !== BUILT_IN_LOCAL_SOURCE_ID);
  return [BUILT_IN_LOCAL_SOURCE, ...withoutBuiltIn];
}

export function persistableDataSources(dataSources: DataSource[]) {
  return stripSensitiveDataSources(
    dataSources.filter((source) => source.id !== BUILT_IN_LOCAL_SOURCE_ID)
  );
}
