import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"

import type { AppState } from "./app-store.types"
import {
  COVER_THUMBNAIL_GENERATION_CONCURRENCY_MAX,
  COVER_THUMBNAIL_GENERATION_CONCURRENCY_MIN,
} from "../config/library-list-performance"
import { defaultSettings } from "./app-store.constants"
import { createDataSourceSlice } from "./data-source-slice"
import { createLibrarySlice } from "./library-slice"
import { createProgramSlice, createSettingsSlice } from "./settings-slice"

type SliceHarness<TSlice> = {
  slice: TSlice
  state: AppState & TSlice
}

function createHarness<TSlice>(
  createSlice: (...args: any[]) => TSlice,
  initialState: Partial<AppState> = {},
): SliceHarness<TSlice> {
  let state = initialState as AppState & TSlice
  const set = (
    next: Partial<AppState> | ((state: AppState & TSlice) => Partial<AppState>),
  ) => {
    state = {
      ...state,
      ...(typeof next === "function" ? next(state) : next),
    }
  }
  const get = () => state
  const slice = createSlice(set, get, {} as never)
  state = { ...slice, ...state }

  return {
    slice,
    get state() {
      return state
    },
  }
}

function dataSource(id: string): DataSource {
  return { id, name: id, hasPassword: false } as DataSource
}

function library(id: string, name = id): Library {
  return {
    id,
    name,
    path: `file:///library/${id}`,
    metadataUri: `file:///library/${id}/metadata.db`,
    bookCount: 0,
    addedAt: 0,
    sourceType: "local",
  } as Library
}

describe("data source slice", () => {
  it("should replace all sources when setting data sources", () => {
    const harness = createHarness(createDataSourceSlice)
    const sources = [dataSource("one"), dataSource("two")]

    harness.slice.setDataSources(sources)

    expect(harness.state.dataSources).toEqual(sources)
  })
})

describe("library slice", () => {
  it("should replace all libraries and active id when setting them directly", () => {
    const harness = createHarness(createLibrarySlice)
    const libraries = [library("one"), library("two")]

    harness.slice.setLibraries(libraries)
    harness.slice.setActiveLibraryId("two")

    expect(harness.state.libraries).toEqual(libraries)
    expect(harness.state.activeLibraryId).toBe("two")
  })
})

describe("settings slice", () => {
  it("should update scalar settings when setter actions run", () => {
    const harness = createHarness(createSettingsSlice, {
      settings: defaultSettings,
    })

    harness.slice.setThemeMode("dark")
    harness.slice.setLanguage("en")
    harness.slice.setSyncOnStartup(false)
    harness.slice.setEnableAutoSync(false)
    harness.slice.setHomeCardStyle("coverBlur")
    harness.slice.setCoverLoadingSkeletonPulseEnabled(false)
    harness.slice.setCoverThumbnailGenerationConcurrency(6)
    harness.slice.setLibraryPerformanceProfilerEnabled(true)

    expect(harness.state.settings).toEqual({
      ...defaultSettings,
      themeMode: "dark",
      language: "en",
      syncOnStartup: false,
      enableAutoSync: false,
      homeCardStyle: "coverBlur",
      coverLoadingSkeletonPulseEnabled: false,
      coverThumbnailGenerationConcurrency: 6,
      libraryPerformanceProfilerEnabled: true,
    })
  })

  it("should clamp cover thumbnail concurrency to the supported range when updating app store slices", () => {
    const harness = createHarness(createSettingsSlice, {
      settings: defaultSettings,
    })

    harness.slice.setCoverThumbnailGenerationConcurrency(99)
    expect(harness.state.settings.coverThumbnailGenerationConcurrency).toBe(
      COVER_THUMBNAIL_GENERATION_CONCURRENCY_MAX,
    )

    harness.slice.setCoverThumbnailGenerationConcurrency(0)
    expect(harness.state.settings.coverThumbnailGenerationConcurrency).toBe(
      COVER_THUMBNAIL_GENERATION_CONCURRENCY_MIN,
    )
  })

  it("should merge reader settings when patching nested settings", () => {
    const harness = createHarness(createSettingsSlice, {
      settings: defaultSettings,
    })

    harness.slice.patchReflowableReaderSettings({
      fontSize: 22,
      columnCount: "1",
    })
    harness.slice.patchFixedReaderSettings({
      background: "black",
      spread: "never",
    })

    expect(harness.state.settings.reflowable).toEqual({
      ...defaultSettings.reflowable,
      fontSize: 22,
      columnCount: "1",
    })
    expect(harness.state.settings.fixed).toEqual({
      ...defaultSettings.fixed,
      background: "black",
      spread: "never",
    })
  })
})

describe("program slice", () => {
  it("should update library view mode when setting mode", () => {
    const harness = createHarness(createProgramSlice)

    harness.slice.setLibraryViewMode("list")

    expect(harness.state.libraryViewMode).toBe("list")
  })
})
