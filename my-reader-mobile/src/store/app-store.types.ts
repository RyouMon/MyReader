import type { StateCreator } from "zustand";

import type { BookItem, DataSource, MobileLibrary } from "../data/types";
import type { ThemeMode } from "../design/tokens";

export type ReaderSettings = {
  themeMode: ThemeMode;
  syncEnabled: boolean;
};

export type PersistedAppState = {
  settings: ReaderSettings;
  dataSources: DataSource[];
  libraries: MobileLibrary[];
  activeLibraryId: string | null;
};

export type AppState = PersistedAppState & {
  books: BookItem[];
  loadingLibraries: boolean;
  loadingBooks: boolean;
  error: string | null;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  initialize: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => void;
  setSyncEnabled: (enabled: boolean) => void;
  clearError: () => void;
  addLibrary: () => Promise<boolean>;
  addResolvedLibrary: (library: MobileLibrary) => Promise<boolean>;
  removeLibrary: (id: string) => Promise<void>;
  setActiveLibrary: (id: string) => Promise<void>;
  addDataSource: (dataSource: DataSource) => Promise<void>;
  removeDataSource: (id: string) => Promise<void>;
  refreshBooks: () => Promise<void>;
};

export type AppStateSlice<TSlice> = StateCreator<AppState, [], [], TSlice>;
