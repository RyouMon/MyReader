import type { Library } from "@my-reader/tools/types/library"
import { act, renderHook } from "@testing-library/react-native"

import type { AppState } from "@/src/store/app-store.types"

import { useSyncStatusPresentation } from "./use-sync-status-presentation"

const localLibrary = {
  id: "local",
  name: "Local Library",
  path: "file:///library",
  sourceType: "local",
} as Library

const remoteLibrary = {
  ...localLibrary,
  id: "remote",
  name: "Remote Library",
  sourceType: "webdav",
} as Library

type MockState = Pick<
  AppState,
  | "activeLibraryId"
  | "libraries"
  | "librarySyncActivityById"
  | "librarySyncHistoryById"
  | "librarySyncTransientResultById"
  | "librarySyncOnlineById"
>

let mockState: MockState = {
  activeLibraryId: localLibrary.id as string | null,
  libraries: [localLibrary, remoteLibrary],
  librarySyncActivityById: {},
  librarySyncHistoryById: {},
  librarySyncTransientResultById: {},
  librarySyncOnlineById: {},
}

jest.mock("@/src/store/app-store", () => ({
  useAppStore: jest.fn((selector) => selector(mockState)),
}))

describe("useSyncStatusPresentation", () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  beforeEach(() => {
    mockState = {
      activeLibraryId: localLibrary.id,
      libraries: [localLibrary, remoteLibrary],
      librarySyncActivityById: {},
      librarySyncHistoryById: {},
      librarySyncTransientResultById: {},
      librarySyncOnlineById: {},
    }
  })

  it("should scope activity to the current active library", () => {
    mockState.librarySyncActivityById = {
      remote: {
        taskId: "remote-task",
        stage: "pulling",
        completed: 1,
        total: 2,
        startedAt: 100,
        reason: "automatic_check",
      },
    }

    const { result } = renderHook(() => useSyncStatusPresentation())

    expect(result.current.library).toEqual(localLibrary)
    expect(result.current.activity).toBeUndefined()
    expect(result.current.indicator).toBe("idle")
  })

  it("should keep a local library online regardless of network state", () => {
    mockState.librarySyncOnlineById = { local: false }

    const { result } = renderHook(() => useSyncStatusPresentation())

    expect(result.current.isOffline).toBe(false)
    expect(result.current.indicator).toBe("idle")
  })

  it("should show offline only for a remote active library", () => {
    mockState.activeLibraryId = remoteLibrary.id
    mockState.librarySyncOnlineById = { remote: false }

    const { result } = renderHook(() => useSyncStatusPresentation())

    expect(result.current.isOffline).toBe(true)
    expect(result.current.indicator).toBe("offline")
  })

  it("should show a recent unchanged result without replacing the last sync", () => {
    mockState.librarySyncHistoryById = {
      local: {
        lastSync: {
          completedAt: 100,
          reason: "local_change",
        },
      },
    }
    mockState.librarySyncTransientResultById = {
      local: {
        result: "unchanged",
        completedAt: Date.now(),
        reason: "automatic_check",
      },
    }

    const { result } = renderHook(() => useSyncStatusPresentation())

    expect(result.current.indicator).toBe("unchanged")
    expect(result.current.transientResult?.reason).toBe("automatic_check")
    expect(result.current.history?.lastSync?.completedAt).toBe(100)
  })

  it("should hide unchanged after the transient status window", () => {
    jest.useFakeTimers()
    jest.setSystemTime(10_000)
    mockState.librarySyncHistoryById = {
      local: {
        lastSync: { completedAt: 100 },
      },
    }
    mockState.librarySyncTransientResultById = {
      local: {
        result: "unchanged",
        completedAt: 10_000,
        reason: "automatic_check",
      },
    }

    const { result } = renderHook(() => useSyncStatusPresentation())
    expect(result.current.indicator).toBe("unchanged")

    act(() => jest.advanceTimersByTime(5_011))

    expect(result.current.indicator).toBe("idle")
    expect(result.current.transientResult).toBeUndefined()
  })

  it("should show a later failure without discarding the last sync", () => {
    mockState.librarySyncHistoryById = {
      local: {
        lastSync: { completedAt: 100, reason: "manual" },
        lastFailure: {
          completedAt: 200,
          message: "Previous failure",
          reason: "automatic_check",
        },
      },
    }

    const { result } = renderHook(() => useSyncStatusPresentation())

    expect(result.current.indicator).toBe("failed")
    expect(result.current.history?.lastSync?.completedAt).toBe(100)
    expect(result.current.history?.lastFailure?.completedAt).toBe(200)
  })
})
