import type { StateCreator } from "zustand"
import type { ReaderThemeKey } from "@my-reader/tools/reader-themes"

import type { ThemeMode } from "../design/tokens"
import type { StatusSlice } from "./status-slice"
import type { DataSourceSlice } from "./data-source-slice"
import type { LibrarySlice } from "./library-slice"
import type { SettingsSlice, ProgramSlice } from "./settings-slice"

export type ReaderTheme = ReaderThemeKey
export type FixedNavigationMode = "horizontal" | "vertical"
export type LibraryViewMode = "grid" | "list"
export type HomeCardStyle = "adaptive" | "coverBlur"

export type TextAlignment = "auto" | "justify" | "start"
export type ColumnCount = "1" | "auto"
export type FontFamilyKey = "serif" | "sans" | "system"
export type FixedBackground = "auto" | "black" | "white"
export type Spread = "auto" | "never" | "always"
export type ReadingProgression = "ltr" | "rtl"

export type ReflowableReaderSettings = {
  theme: ReaderTheme
  fontFamily: FontFamilyKey
  fontSize: number
  lineHeight: number
  paddingX: number
  textAlign: TextAlignment
  columnCount: ColumnCount
}

export type FixedReaderSettings = {
  background: FixedBackground
  navigationMode: FixedNavigationMode
  readingProgression: ReadingProgression
  spread: Spread
}

export type ReaderSettings = {
  themeMode: ThemeMode
  language: string
  syncOnStartup: boolean
  enableAutoSync: boolean
  homeCardStyle: HomeCardStyle
  coverLoadingSkeletonPulseEnabled: boolean
  coverThumbnailGenerationConcurrency: number
  libraryPerformanceProfilerEnabled: boolean
  reflowable: ReflowableReaderSettings
  fixed: FixedReaderSettings
}

export type PersistedAppState = {
  settings: ReaderSettings
  dataSources: import("@my-reader/tools/types/data-source").DataSource[]
  libraries: import("@my-reader/tools/types/library").Library[]
  activeLibraryId: string | null
  libraryViewMode: LibraryViewMode
}

export type AppState = StatusSlice &
  DataSourceSlice &
  LibrarySlice &
  SettingsSlice &
  ProgramSlice

export type AppStateSlice<TSlice> = StateCreator<AppState, [], [], TSlice>
