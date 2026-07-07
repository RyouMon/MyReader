import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "../constants/local-library-data-source"
import {
  COVER_LOADING_SKELETON_PULSE_ENABLED,
  COVER_THUMBNAIL_GENERATION_CONCURRENCY,
} from "../config/library-list-performance"
import type { DataSource } from "@my-reader/tools/types/data-source"

import type { ReaderSettings } from "./app-store.types"

export const STORE_NAME = "myreader-mobile-app-state"

export const defaultSettings: ReaderSettings = {
  themeMode: "system",
  language: "",
  syncOnStartup: true,
  enableAutoSync: true,
  homeCardStyle: "adaptive",
  coverLoadingSkeletonPulseEnabled: COVER_LOADING_SKELETON_PULSE_ENABLED,
  coverThumbnailGenerationConcurrency: COVER_THUMBNAIL_GENERATION_CONCURRENCY,
  libraryPerformanceProfilerEnabled: false,
  reflowable: {
    theme: "paper",
    fontFamily: "default",
    fontFamiliesByLanguage: {},
    fontSize: 18,
    lineHeight: 1.85,
    paddingX: 20,
    textAlign: "auto",
    columnCount: "auto",
  },
  fixed: {
    background: "auto",
    navigationMode: "horizontal",
    readingProgression: "ltr",
    spread: "auto",
  },
}

export const DEFAULT_LIBRARY_VIEW_MODE = "grid"

/** Exclude the local library data source id. Used in persist partialize and merge. */
export function excludeLocalLibrarySource(dataSources: DataSource[]) {
  return dataSources.filter(
    (source) => source.id !== LOCAL_LIBRARY_DATA_SOURCE_ID,
  )
}
