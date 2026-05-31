import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "../constants/local-library-data-source";
import type { DataSource } from "@my-reader/tools/types/data-source";

import type { ReaderSettings } from "./app-store.types";

export const STORE_NAME = "myreader-mobile-app-state";

export const defaultSettings: ReaderSettings = {
  themeMode: "system",
  language: "",
  syncOnStartup: true,
  enableAutoSync: true,
  cache: {
    maxCacheSizeMB: 2048,
  },
  reflowable: {
    theme: "paper",
    fontSize: 18,
    lineHeight: 1.85,
    paddingX: 20,
    brightness: 100,
    textAlign: "auto",
    columnCount: "auto",
  },
  fixed: {
    theme: "night",
    navigationMode: "horizontal",
    brightness: 100,
    zoomScale: 1,
  },
};

export const DEFAULT_LIBRARY_VIEW_MODE = "grid";

/** Exclude the local library data source id. Used in persist partialize and merge. */
export function excludeLocalLibrarySource(dataSources: DataSource[]) {
  return dataSources.filter((source) => source.id !== LOCAL_LIBRARY_DATA_SOURCE_ID);
}
