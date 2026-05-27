import type { StateCreator } from "zustand";

import type { DataSource } from "@my-reader/tools/types/data-source";
import type { Library } from "@my-reader/tools/types/library";

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

export type AppState = Omit<PersistedAppState, "dataSources" | "libraries" | "activeLibraryId"> &
  { dataSources: DataSource[]; loading: boolean; hydrated: boolean } &
  {
    // DataSource setters
    setDataSources: (dataSources: DataSource[]) => void;
    setLoading: (loading: boolean) => void;
    setHydrated: (value: boolean) => void;
    upsertDataSource: (ds: DataSource) => void;
    removeDataSourceById: (id: string) => void;
    error: string | null;
    setError: (error: string | null) => void;
    clearError: () => void;

    // Library setters
    libraries: Library[];
    activeLibraryId: string | null;
    setLibraries: (libraries: Library[]) => void;
    setActiveLibraryId: (id: string | null) => void;
    setRefreshingLibraryId: (id: string | null) => void;
    upsertLibrary: (library: Library) => void;
    removeLibraryById: (id: string) => void;
    refreshingLibraryId: string | null;
    books: import("../data/types").BookItem[];
    loadingBooks: boolean;

    // Settings
    settings: ReaderSettings;
    setThemeMode: (mode: ThemeMode) => void;
    setLanguage: (language: string) => void;
    setLibraryViewMode: (mode: LibraryViewMode) => void;
    setSyncEnabled: (enabled: boolean) => void;
    patchCacheSettings: (patch: Partial<ReaderSettings["cache"]>) => void;
    patchReflowableReaderSettings: (patch: Partial<ReflowableReaderSettings>) => void;
    patchFixedReaderSettings: (patch: Partial<FixedReaderSettings>) => void;
  };

export type AppStateSlice<TSlice> = StateCreator<AppState, [], [], TSlice>;