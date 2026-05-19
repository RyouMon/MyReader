import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "../constants/local-library-data-source";
import type { DataSource } from "../data/types";
import { stripSensitiveDataSources } from "./secure-credential-store";

import type { ReaderSettings } from "./app-store.types";

export const STORE_NAME = "myreader-mobile-app-state";

export const defaultSettings: ReaderSettings = {
  themeMode: "system",
  language: "",
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

export const DEFAULT_LIBRARY_VIEW_MODE = "grid";

/** Store 中仅保留 WebDAV；剔除误写入的逻辑本机 id */
export function mergeDataSources(dataSources: DataSource[]) {
  return dataSources.filter((source) => source.id !== LOCAL_LIBRARY_DATA_SOURCE_ID);
}

export function persistableDataSources(dataSources: DataSource[]) {
  return stripSensitiveDataSources(
    dataSources.filter((source) => source.id !== LOCAL_LIBRARY_DATA_SOURCE_ID)
  );
}
