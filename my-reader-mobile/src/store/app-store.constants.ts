import type { DataSource, LocalDataSource } from "../data/types";

import type { ReaderSettings } from "./app-store.types";

export const BUILT_IN_LOCAL_SOURCE_ID = "device-local";
export const STORE_NAME = "myreader-mobile-app-state";

export const BUILT_IN_LOCAL_SOURCE: LocalDataSource = {
  id: BUILT_IN_LOCAL_SOURCE_ID,
  type: "local",
  name: "手机",
  createdAt: 0,
};

export const defaultSettings: ReaderSettings = {
  themeMode: "system",
  syncEnabled: true,
};

export function mergeDataSources(dataSources: DataSource[]) {
  const withoutBuiltIn = dataSources.filter((source) => source.id !== BUILT_IN_LOCAL_SOURCE_ID);
  return [BUILT_IN_LOCAL_SOURCE, ...withoutBuiltIn];
}

export function persistableDataSources(dataSources: DataSource[]) {
  return dataSources.filter((source) => source.id !== BUILT_IN_LOCAL_SOURCE_ID);
}
