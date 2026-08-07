import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"

import type { AppState, AppStateSlice } from "./app-store.types"
import {
  COVER_THUMBNAIL_GENERATION_CONCURRENCY_MAX,
  COVER_THUMBNAIL_GENERATION_CONCURRENCY_MIN,
} from "../config/library-list-performance"
import { defaultSettings } from "./app-store.constants"
import { createDataSourceSlice } from "./data-source-slice"
import { createLibrarySlice } from "./library-slice"
import { createProgramSlice, createSettingsSlice } from "./settings-slice"
import {
  coerceLibrarySyncHistory,
  createSyncStatusSlice,
} from "./sync-status-slice"

type SliceHarness<TSlice> = {
  slice: TSlice
  state: AppState & TSlice
}

function createHarness<TSlice>(
  createSlice: AppStateSlice<TSlice>,
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
  const slice = createSlice(
    set as Parameters<AppStateSlice<TSlice>>[0],
    get as Parameters<AppStateSlice<TSlice>>[1],
    {} as Parameters<AppStateSlice<TSlice>>[2],
  )
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

describe("sync status slice", () => {
  it("should restore only recognized persisted sync reasons", () => {
    expect(
      coerceLibrarySyncHistory({
        one: { result: "success", completedAt: 100, reason: "manual" },
        two: { result: "success", completedAt: 200, reason: "legacy" },
        three: {
          result: "failure",
          completedAt: 300,
          message: "Offline",
          reason: "automatic_check",
        },
        four: {
          lastSync: { completedAt: 400, reason: "manual" },
          lastFailure: {
            completedAt: 500,
            failureStage: "pulling",
            message: "Unavailable",
          },
        },
      }),
    ).toEqual({
      one: { lastSync: { completedAt: 100, reason: "manual" } },
      two: { lastSync: { completedAt: 200 } },
      three: {
        lastFailure: {
          completedAt: 300,
          message: "Offline",
          reason: "automatic_check",
        },
      },
      four: {
        lastSync: { completedAt: 400, reason: "manual" },
        lastFailure: {
          completedAt: 500,
          failureStage: "pulling",
          message: "Unavailable",
        },
      },
    })
  })

  it("should retain only the newest task progress for a library", () => {
    const harness = createHarness(createSyncStatusSlice)

    harness.slice.startLibrarySync({
      libraryId: "one",
      taskId: "older",
      startedAt: 100,
      reason: "automatic_check",
    })
    harness.slice.startLibrarySync({
      libraryId: "one",
      taskId: "newer",
      startedAt: 200,
      reason: "manual",
    })
    harness.slice.updateLibrarySyncProgress({
      libraryId: "one",
      taskId: "older",
      stage: "pushing",
      completed: 1,
      total: 1,
    })

    expect(harness.state.librarySyncActivityById.one).toMatchObject({
      taskId: "newer",
      stage: "preparing",
      reason: "manual",
    })
  })

  it("should persist the last failure stage after an operation finishes", () => {
    const harness = createHarness(createSyncStatusSlice)

    harness.slice.startLibrarySync({
      libraryId: "one",
      taskId: "task",
      startedAt: 100,
      reason: "local_change",
    })
    harness.slice.updateLibrarySyncProgress({
      libraryId: "one",
      taskId: "task",
      stage: "applying",
      completed: 1,
      total: 2,
    })
    harness.slice.failLibrarySync({
      libraryId: "one",
      taskId: "task",
      completedAt: 200,
      failureKind: "data_integrity",
      message: "Damaged history",
      reason: "local_change",
    })

    expect(harness.state.librarySyncActivityById.one).toBeUndefined()
    expect(harness.state.librarySyncHistoryById.one).toEqual({
      lastFailure: {
        completedAt: 200,
        failureKind: "data_integrity",
        failureStage: "applying",
        message: "Damaged history",
        reason: "local_change",
      },
    })
  })

  it("should replace a previous failure with a later success", () => {
    const harness = createHarness(createSyncStatusSlice)

    harness.slice.failLibrarySync({
      libraryId: "one",
      taskId: "failed",
      completedAt: 100,
      message: "Offline",
      reason: "automatic_check",
    })
    harness.slice.succeedLibrarySync({
      libraryId: "one",
      taskId: "succeeded",
      completedAt: 200,
      reason: "manual",
    })

    expect(harness.state.librarySyncHistoryById.one).toEqual({
      lastSync: {
        completedAt: 200,
        reason: "manual",
      },
    })
  })

  it("should clear a previous failure after unchanged without replacing the last sync", () => {
    const harness = createHarness(createSyncStatusSlice)

    harness.slice.succeedLibrarySync({
      libraryId: "one",
      taskId: "succeeded",
      completedAt: 50,
      reason: "manual",
    })
    harness.slice.failLibrarySync({
      libraryId: "one",
      taskId: "failed",
      completedAt: 100,
      message: "Offline",
      reason: "local_change",
    })
    harness.slice.startLibrarySync({
      libraryId: "one",
      taskId: "check",
      startedAt: 150,
      reason: "automatic_check",
    })
    harness.slice.finishLibrarySyncUnchanged({
      libraryId: "one",
      taskId: "check",
      completedAt: 200,
      reason: "automatic_check",
    })

    expect(harness.state.librarySyncActivityById.one).toBeUndefined()
    expect(harness.state.librarySyncTransientResultById.one).toEqual({
      result: "unchanged",
      completedAt: 200,
      reason: "automatic_check",
    })
    expect(harness.state.librarySyncHistoryById.one).toEqual({
      lastSync: {
        completedAt: 50,
        reason: "manual",
      },
    })
  })

  it("should remove failure-only history after unchanged", () => {
    const harness = createHarness(createSyncStatusSlice)

    harness.slice.failLibrarySync({
      libraryId: "one",
      taskId: "failed",
      completedAt: 100,
      message: "Offline",
      reason: "local_change",
    })
    harness.slice.startLibrarySync({
      libraryId: "one",
      taskId: "check",
      startedAt: 150,
      reason: "automatic_check",
    })
    harness.slice.finishLibrarySyncUnchanged({
      libraryId: "one",
      taskId: "check",
      completedAt: 200,
      reason: "automatic_check",
    })

    expect(harness.state.librarySyncHistoryById.one).toBeUndefined()
  })

  it("should clear a cancelled current task without recording a failure", () => {
    const harness = createHarness(createSyncStatusSlice)

    harness.slice.startLibrarySync({
      libraryId: "one",
      taskId: "task",
      startedAt: 100,
      reason: "local_change",
    })
    harness.slice.cancelLibrarySync({ libraryId: "one", taskId: "task" })

    expect(harness.state.librarySyncActivityById.one).toBeUndefined()
    expect(harness.state.librarySyncHistoryById.one).toBeUndefined()
  })
})
