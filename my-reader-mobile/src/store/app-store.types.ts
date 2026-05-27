import type { StateCreator } from "zustand";

import type { DataSource } from "@my-reader/tools/types/data-source";
import type { Library } from "@my-reader/tools/types/library";

import type { BookItem } from "../data/types";
import type { ThemeMode } from "../design/tokens";

export type ReaderTheme = "neutral" | "paper" | "sepia" | "green" | "ocean" | "contrast1" | "night" | "contrast2";
export type FixedNavigationMode = "horizontal" | "vertical";
export type LibraryViewMode = "grid" | "list";

export type TextAlignment = "auto" | "justify" | "start";
export type ColumnCount = "1" | "auto";

export type ReflowableReaderSettings = {
  theme: ReaderTheme;
  fontSize: number;
  lineHeight: number;
  paddingX: number;
  brightness: number;
  textAlign: TextAlignment;
  columnCount: ColumnCount;
};

export type FixedReaderSettings = {
  theme: ReaderTheme;
  navigationMode: FixedNavigationMode;
  brightness: number;
  zoomScale: number;
};

export type ReaderSettings = {
  themeMode: ThemeMode;
  language: string;
  syncEnabled: boolean;
  cache: {
    maxCacheSizeMB: number;
  };
  reflowable: ReflowableReaderSettings;
  fixed: FixedReaderSettings;
};

export type PersistedAppState = {
  settings: ReaderSettings;
  dataSources: DataSource[];
  libraries: Library[];
  activeLibraryId: string | null;
  libraryViewMode: LibraryViewMode;
};

type DataSourceActions = {
  hydrateFromBackend: () => Promise<void>;
  refreshDataSources: (id: string) => Promise<void>;
  createDataSource: (datasource: DataSource) => Promise<DataSource>;
  updateDataSource: (id: string, datasource: DataSource) => Promise<void>;
  deleteDataSource: (id: string) => Promise<void>;
  testDataSourceConnection: (
    datasource: DataSource,
  ) => Promise<{ ok: boolean; message: string }>;
};

type LibraryActions = {
  libraries: Library[];
  activeLibraryId: string | null;
  loading: boolean;
  hydrated: boolean;
  hydrateFromBackend: () => Promise<void>;
  refreshLibraries: () => Promise<void>;
  addLibrary: (path?: string, name?: string) => Promise<Library | null>;
  removeLibrary: (id: string) => Promise<void>;
  switchLibrary: (id: string) => Promise<void>;
};

export type AppState = Omit<PersistedAppState, "dataSources" | "libraries" | "activeLibraryId"> &
  { dataSources: DataSource[]; loading: boolean; hydrated: boolean } &
  DataSourceActions &
  LibraryActions & {
    books: BookItem[];
    loadingBooks: boolean;
    error: string | null;
    setHydrated: (value: boolean) => void;
    setThemeMode: (mode: ThemeMode) => void;
    setLanguage: (language: string) => void;
    setLibraryViewMode: (mode: LibraryViewMode) => void;
    setSyncEnabled: (enabled: boolean) => void;
    patchCacheSettings: (patch: Partial<ReaderSettings["cache"]>) => void;
    patchReflowableReaderSettings: (patch: Partial<ReflowableReaderSettings>) => void;
    patchFixedReaderSettings: (patch: Partial<FixedReaderSettings>) => void;
    refreshingLibraryId: string | null;
    clearError: () => void;
    addResolvedLibrary: (library: Library) => Promise<boolean>;
    refreshBooks: () => Promise<void>;
    refreshLibrary: (libraryId: string) => Promise<void>;
  };

export type AppStateSlice<TSlice> = StateCreator<AppState, [], [], TSlice>;