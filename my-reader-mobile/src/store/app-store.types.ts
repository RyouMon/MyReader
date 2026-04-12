import type { StateCreator } from "zustand";

import type { BookItem, DataSource, MobileLibrary } from "../data/types";
import type { ThemeMode } from "../design/tokens";

export type ReaderTheme = "light" | "paper" | "green" | "dark";
export type ReadingLayout = "scroll" | "paginate";
export type FixedNavigationMode = "horizontal" | "vertical";

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
  reflowable: ReflowableReaderSettings;
  fixed: FixedReaderSettings;
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
  patchReflowableReaderSettings: (patch: Partial<ReflowableReaderSettings>) => void;
  patchFixedReaderSettings: (patch: Partial<FixedReaderSettings>) => void;
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
