import type { StateCreator } from "zustand";

import type { DataSourceStore } from "@my-reader/tools/store/data-source";
import type { LibraryStore } from "@my-reader/tools/store/library";

import type { BookItem, Library } from "../data/types";
import type { ThemeMode } from "../design/tokens";

export type ReaderTheme = "neutral" | "paper" | "sepia" | "green" | "ocean" | "contrast1" | "night" | "contrast2";
export type ReadingLayout = "scroll" | "paginate";
export type FixedNavigationMode = "horizontal" | "vertical";
export type LibraryViewMode = "grid" | "list";

export type TextAlignment = "auto" | "justify" | "start";
export type ColumnCount = "1" | "auto";

export type ReflowableReaderSettings = {
  theme: ReaderTheme;
  fontSize: number;
  lineHeight: number;
  paddingX: number;
  readingLayout: ReadingLayout;
  brightness: number;
  textAlign: TextAlignment;
  columnCount: ColumnCount;
};

export type FixedReaderSettings = {
  theme: ReaderTheme;
  readingLayout: ReadingLayout;
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
  dataSources: DataSourceStore["dataSources"];
  libraries: Library[];
  activeLibraryId: string | null;
  libraryViewMode: LibraryViewMode;
};

type DataSourceActions = Pick<
  DataSourceStore,
  | "hydrateFromBackend"
  | "refreshDataSources"
  | "createDataSource"
  | "updateDataSource"
  | "deleteDataSource"
  | "testDataSourceConnection"
>;

type LibraryActions = Pick<
  LibraryStore,
  | "libraries"
  | "activeLibraryId"
  | "loading"
  | "hydrated"
  | "hydrateFromBackend"
  | "refreshLibraries"
  | "addLibrary"
  | "removeLibrary"
  | "switchLibrary"
>;

export type AppState = Omit<PersistedAppState, "dataSources" | "libraries" | "activeLibraryId"> &
  Pick<DataSourceStore, "dataSources" | "loading" | "hydrated"> &
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
