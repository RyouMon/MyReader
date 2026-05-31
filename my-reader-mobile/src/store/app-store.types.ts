import type { StateCreator } from "zustand";

import type { ThemeMode } from "../design/tokens";
import type { StatusSlice } from "./status-slice";
import type { DataSourceSlice } from "./data-source-slice";
import type { LibrarySlice } from "./library-slice";
import type { SettingsSlice, ProgramSlice } from "./settings-slice";

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
  syncOnStartup: boolean;
  enableAutoSync: boolean;
  reflowable: ReflowableReaderSettings;
  fixed: FixedReaderSettings;
};

export type PersistedAppState = {
  settings: ReaderSettings;
  dataSources: import("@my-reader/tools/types/data-source").DataSource[];
  libraries: import("@my-reader/tools/types/library").Library[];
  activeLibraryId: string | null;
  libraryViewMode: LibraryViewMode;
};

export type AppState = StatusSlice & DataSourceSlice & LibrarySlice & SettingsSlice & ProgramSlice;

export type AppStateSlice<TSlice> = StateCreator<AppState, [], [], TSlice>;