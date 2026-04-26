import type { StateCreator } from "zustand";

import type { DataSourceStore } from "my-reader-tools/store/data-source";

import type { BookItem, MobileLibrary } from "../data/types";
import type { ThemeMode } from "../design/tokens";

export type ReaderTheme = "light" | "paper" | "green" | "dark";
export type ReadingLayout = "scroll" | "paginate";
export type FixedNavigationMode = "horizontal" | "vertical";
export type LibraryViewMode = "grid" | "list";

export type BookDetailLibraryOrder = {
  bookIds: string[];
  libraryId: string;
} | null;

export type ReflowableReaderSettings = {
  theme: ReaderTheme;
  fontSize: number;
  lineHeight: number;
  paddingX: number;
  readingLayout: ReadingLayout;
  brightness: number;
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
  libraries: MobileLibrary[];
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

export type AppState = Omit<PersistedAppState, "dataSources"> &
  Pick<DataSourceStore, "dataSources" | "loading" | "hydrated"> &
  DataSourceActions & {
    books: BookItem[];
    bookDetailLibraryOrder: BookDetailLibraryOrder;
    loadingLibraries: boolean;
    loadingBooks: boolean;
    error: string | null;
    hasHydrated: boolean;
    setHasHydrated: (value: boolean) => void;
    setBookDetailLibraryOrder: (order: BookDetailLibraryOrder) => void;
    initialize: () => Promise<void>;
    setThemeMode: (mode: ThemeMode) => void;
    setLibraryViewMode: (mode: LibraryViewMode) => void;
    setSyncEnabled: (enabled: boolean) => void;
    patchCacheSettings: (patch: Partial<ReaderSettings["cache"]>) => void;
    patchReflowableReaderSettings: (patch: Partial<ReflowableReaderSettings>) => void;
    patchFixedReaderSettings: (patch: Partial<FixedReaderSettings>) => void;
    clearError: () => void;
    addLibrary: () => Promise<boolean>;
    addResolvedLibrary: (library: MobileLibrary) => Promise<boolean>;
    removeLibrary: (id: string) => Promise<void>;
    setActiveLibrary: (id: string) => Promise<void>;
    refreshBooks: () => Promise<void>;
  };

export type AppStateSlice<TSlice> = StateCreator<AppState, [], [], TSlice>;
