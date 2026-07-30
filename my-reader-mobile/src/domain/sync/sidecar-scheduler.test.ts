jest.mock("@/modules/myreader-rust-components", () => ({
  __esModule: true,
  default: {
    advanceSyncScheduler: jest.fn(),
  },
}))

import MyReaderRustComponents from "@/modules/myreader-rust-components"

import {
  createSidecarSyncScheduler,
  type SidecarSyncExecution,
} from "./sidecar-scheduler"

const emptyTransition = {
  schedules: [],
  cancelTimersFor: [],
  execution: null,
  retry: null,
}

type TestTransition = {
  schedules: Array<{
    libraryId: string
    generation: number
    deadline: number
  }>
  cancelTimersFor: string[]
  execution: SidecarSyncExecution | null
  retry: { retryCount: number; nextRetryAt: number } | null
}

function result(transition: Partial<TestTransition>): string {
  return JSON.stringify({
    state: { revision: 1 },
    transition: { ...emptyTransition, ...transition },
  })
}

describe("sidecar sync scheduler native adapter", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(1_000)
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("should execute scheduled work when the Rust state machine reaches its deadline", async () => {
    const execution: SidecarSyncExecution = {
      libraryId: "library-1",
      mode: "full",
      reasons: ["app_foregrounded", "local_change"],
    }
    jest
      .mocked(MyReaderRustComponents.advanceSyncScheduler)
      .mockReturnValue(result({}))
      .mockReturnValueOnce(
        result({
          schedules: [
            { libraryId: "library-1", generation: 7, deadline: 1_100 },
          ],
        }),
      )
      .mockReturnValueOnce(result({ execution }))
      .mockReturnValueOnce(result({}))
    const execute = jest.fn(async () => {})
    const scheduler = createSidecarSyncScheduler({ execute })

    scheduler.request({
      libraryId: "library-1",
      mode: "full",
      reason: "app_foregrounded",
      timing: "debounced",
    })
    await jest.advanceTimersByTimeAsync(100)

    expect(execute).toHaveBeenCalledWith(execution, "library-1:1100:1")
    expect(MyReaderRustComponents.advanceSyncScheduler).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ revision: 1 }),
      expect.any(String),
      JSON.stringify({
        type: "begin",
        libraryId: "library-1",
        generation: 7,
      }),
    )
    scheduler.dispose()
  })

  it("should expose retry metadata when Rust schedules transient backoff", async () => {
    const execution: SidecarSyncExecution = {
      libraryId: "library-1",
      mode: "push_only",
      reasons: ["local_change"],
    }
    jest
      .mocked(MyReaderRustComponents.advanceSyncScheduler)
      .mockReturnValue(result({}))
      .mockReturnValueOnce(
        result({
          schedules: [
            { libraryId: "library-1", generation: 1, deadline: 1_000 },
          ],
        }),
      )
      .mockReturnValueOnce(result({ execution }))
      .mockReturnValueOnce(
        result({
          schedules: [
            { libraryId: "library-1", generation: 2, deadline: 2_000 },
          ],
          retry: { retryCount: 1, nextRetryAt: 2_000 },
        }),
      )
    const onRetryScheduled = jest.fn(async () => {})
    const error = new Error("network unavailable")
    const scheduler = createSidecarSyncScheduler({
      execute: async () => {
        throw error
      },
      classifyError: () => "retry",
      random: () => 0.5,
      onRetryScheduled,
    })

    scheduler.request({
      libraryId: "library-1",
      mode: "push_only",
      reason: "local_change",
      timing: "immediate",
    })
    await jest.advanceTimersByTimeAsync(0)

    expect(onRetryScheduled).toHaveBeenCalledWith(error, execution, {
      retryCount: 1,
      nextRetryAt: 2_000,
    })
    expect(MyReaderRustComponents.advanceSyncScheduler).toHaveBeenNthCalledWith(
      3,
      JSON.stringify({ revision: 1 }),
      expect.any(String),
      JSON.stringify({
        type: "retry",
        execution,
        nowMs: 1_000,
        randomFraction: 0.5,
      }),
    )
    scheduler.dispose()
  })

  it("should pass custom timing policy to the Rust state machine", () => {
    jest
      .mocked(MyReaderRustComponents.advanceSyncScheduler)
      .mockReturnValue(result({}))
    const scheduler = createSidecarSyncScheduler({
      execute: async () => {},
      debounceMs: 500,
      maxWaitMs: 2_000,
      retryBaseMs: 3_000,
      retryMaxMs: 30_000,
    })

    scheduler.setOnline(false)

    expect(MyReaderRustComponents.advanceSyncScheduler).toHaveBeenCalledWith(
      null,
      JSON.stringify({
        debounceMs: 500,
        maxWaitMs: 2_000,
        retryBaseMs: 3_000,
        retryMaxMs: 30_000,
      }),
      JSON.stringify({
        type: "set_online",
        online: false,
        nowMs: 1_000,
      }),
    )
    scheduler.dispose()
  })

  it("should cancel running native task when scheduler is disposed", async () => {
    const execution: SidecarSyncExecution = {
      libraryId: "library-1",
      mode: "full",
      reasons: ["app_foregrounded"],
    }
    jest
      .mocked(MyReaderRustComponents.advanceSyncScheduler)
      .mockReturnValue(result({}))
      .mockReturnValueOnce(
        result({
          schedules: [
            { libraryId: "library-1", generation: 1, deadline: 1_000 },
          ],
        }),
      )
      .mockReturnValueOnce(result({ execution }))
    const cancelTask = jest.fn()
    const onSuspended = jest.fn()
    let rejectTask!: (error: Error) => void
    const scheduler = createSidecarSyncScheduler({
      execute: async () =>
        new Promise<void>((_resolve, reject) => {
          rejectTask = reject
        }),
      cancelTask,
      classifyError: () => "suspend",
      onSuspended,
    })

    scheduler.request({
      libraryId: "library-1",
      mode: "full",
      reason: "app_foregrounded",
      timing: "immediate",
    })
    await jest.advanceTimersByTimeAsync(0)
    scheduler.dispose()

    expect(cancelTask).toHaveBeenCalledWith("library-1:1000:1")
    rejectTask(new Error("Sync task cancelled"))
    await Promise.resolve()
    await Promise.resolve()
    expect(onSuspended).not.toHaveBeenCalled()
  })
})
