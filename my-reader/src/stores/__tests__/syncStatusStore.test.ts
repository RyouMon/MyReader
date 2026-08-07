import { beforeEach, describe, expect, it } from "vitest"
import { useSyncStatusStore } from "@/stores/syncStatusStore"

function observe(
  observation: Parameters<
    ReturnType<typeof useSyncStatusStore.getState>["observeLibrarySync"]
  >[0],
) {
  useSyncStatusStore.getState().observeLibrarySync(observation)
}

describe("syncStatusStore", () => {
  beforeEach(() => {
    localStorage.clear()
    useSyncStatusStore.setState({
      librarySyncActivityById: {},
      librarySyncHistoryById: {},
      librarySyncTransientResultById: {},
      networkOnline: true,
    })
  })

  it("should clear an older failure without changing last sync when a check is unchanged", () => {
    observe({
      type: "started",
      libraryId: "library-1",
      taskId: "success",
      startedAt: 100,
      reason: "manual",
    })
    observe({
      type: "succeeded",
      libraryId: "library-1",
      taskId: "success",
      completedAt: 110,
      reason: "manual",
    })
    observe({
      type: "failed",
      libraryId: "library-1",
      taskId: "failed",
      completedAt: 210,
      failureKind: "connectivity",
      failureStage: "pulling",
      message: "offline",
      reason: "automatic_check",
    })
    observe({
      type: "started",
      libraryId: "library-1",
      taskId: "unchanged",
      startedAt: 300,
      reason: "automatic_check",
    })
    observe({
      type: "unchanged",
      libraryId: "library-1",
      taskId: "unchanged",
      completedAt: 310,
      reason: "automatic_check",
    })

    const state = useSyncStatusStore.getState()
    expect(state.librarySyncHistoryById["library-1"]).toEqual({
      lastSync: { completedAt: 110, reason: "manual" },
    })
    expect(state.librarySyncTransientResultById["library-1"]).toEqual({
      result: "unchanged",
      completedAt: 310,
      reason: "automatic_check",
    })
  })

  it("should ignore progress from an older task when a newer sync is active", () => {
    observe({
      type: "started",
      libraryId: "library-1",
      taskId: "new-task",
      startedAt: 200,
      reason: "local_change",
    })
    observe({
      type: "progress",
      libraryId: "library-1",
      taskId: "old-task",
      stage: "pulling",
      completed: 2,
      total: 4,
    })

    expect(
      useSyncStatusStore.getState().librarySyncActivityById["library-1"],
    ).toMatchObject({
      taskId: "new-task",
      stage: "preparing",
      completed: 0,
      total: 0,
    })
  })
})
