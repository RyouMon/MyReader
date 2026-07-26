import {
  createSidecarSyncScheduler,
  type SidecarSyncExecution,
} from "./sidecar-scheduler"

describe("sidecar sync scheduler", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("should coalesce and upgrade work when changes arrive during debounce", async () => {
    const executions: SidecarSyncExecution[] = []
    const scheduler = createSidecarSyncScheduler({
      execute: async (execution) => {
        executions.push(execution)
      },
    })

    scheduler.request({
      libraryId: "library-1",
      mode: "push_only",
      reason: "local_change",
      timing: "debounced",
    })
    jest.advanceTimersByTime(1_000)
    scheduler.request({
      libraryId: "library-1",
      mode: "full",
      reason: "app_foregrounded",
      timing: "debounced",
    })

    await jest.advanceTimersByTimeAsync(2_000)

    expect(executions).toEqual([
      {
        libraryId: "library-1",
        mode: "full",
        reasons: ["app_foregrounded", "local_change"],
      },
    ])
    scheduler.dispose()
  })

  it("should execute by maximum wait when writes keep resetting debounce", async () => {
    const execute = jest.fn(async () => {})
    const scheduler = createSidecarSyncScheduler({
      execute,
      debounceMs: 2_000,
      maxWaitMs: 5_000,
    })

    for (let elapsed = 0; elapsed < 5_000; elapsed += 1_000) {
      scheduler.request({
        libraryId: "library-1",
        mode: "push_only",
        reason: "local_change",
        timing: "debounced",
      })
      await jest.advanceTimersByTimeAsync(1_000)
    }

    expect(execute).toHaveBeenCalledTimes(1)
    scheduler.dispose()
  })

  it("should rerun without overlap when work arrives during execution", async () => {
    const releases: Array<() => void> = []
    const execute = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve)
        }),
    )
    const scheduler = createSidecarSyncScheduler({ execute })

    scheduler.request({
      libraryId: "library-1",
      mode: "push_only",
      reason: "local_change",
      timing: "immediate",
    })
    await jest.advanceTimersByTimeAsync(0)
    scheduler.request({
      libraryId: "library-1",
      mode: "full",
      reason: "network_reconnected",
      timing: "immediate",
    })
    await jest.advanceTimersByTimeAsync(0)

    expect(execute).toHaveBeenCalledTimes(1)

    releases[0]!()
    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(0)

    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenLastCalledWith({
      libraryId: "library-1",
      mode: "full",
      reasons: ["network_reconnected"],
    })
    scheduler.dispose()
  })

  it("should retry with jittered backoff when execution fails transiently", async () => {
    const execute = jest
      .fn<Promise<void>, [SidecarSyncExecution]>()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce()
    const scheduler = createSidecarSyncScheduler({
      execute,
      classifyError: () => "retry",
      random: () => 0.5,
      retryBaseMs: 2_000,
    })

    scheduler.request({
      libraryId: "library-1",
      mode: "push_only",
      reason: "local_change",
      timing: "immediate",
    })
    await jest.advanceTimersByTimeAsync(0)
    await jest.advanceTimersByTimeAsync(999)

    expect(execute).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(1)

    expect(execute).toHaveBeenCalledTimes(2)
    scheduler.dispose()
  })

  it("should expose retry deadline when transient backoff is scheduled", async () => {
    jest.setSystemTime(100_000)
    const onRetryScheduled = jest.fn(async () => {})
    const scheduler = createSidecarSyncScheduler({
      execute: async () => {
        throw new Error("network unavailable")
      },
      classifyError: () => "retry",
      random: () => 0.5,
      retryBaseMs: 2_000,
      onRetryScheduled,
    })

    scheduler.request({
      libraryId: "library-1",
      mode: "full",
      reason: "app_foregrounded",
      timing: "immediate",
    })
    await jest.advanceTimersByTimeAsync(0)

    expect(onRetryScheduled).toHaveBeenCalledWith(
      expect.any(Error),
      {
        libraryId: "library-1",
        mode: "full",
        reasons: ["app_foregrounded"],
      },
      {
        retryCount: 1,
        nextRetryAt: 101_000,
      },
    )
    scheduler.dispose()
  })

  it("should wait for resume when execution fails with suspended error", async () => {
    const execute = jest
      .fn<Promise<void>, [SidecarSyncExecution]>()
      .mockRejectedValueOnce(new Error("credential expired"))
      .mockResolvedValueOnce()
    const scheduler = createSidecarSyncScheduler({
      execute,
      classifyError: () => "suspend",
    })

    scheduler.request({
      libraryId: "library-1",
      mode: "full",
      reason: "app_foregrounded",
      timing: "immediate",
    })
    await jest.advanceTimersByTimeAsync(0)
    await jest.advanceTimersByTimeAsync(10 * 60_000)

    expect(execute).toHaveBeenCalledTimes(1)

    scheduler.resume("library-1")
    await jest.advanceTimersByTimeAsync(0)

    expect(execute).toHaveBeenCalledTimes(2)
    scheduler.dispose()
  })

  it("should execute pending work when network reconnects", async () => {
    const execute = jest.fn(async () => {})
    const scheduler = createSidecarSyncScheduler({ execute })
    scheduler.setOnline(false)

    scheduler.request({
      libraryId: "library-1",
      mode: "push_only",
      reason: "local_change",
      timing: "immediate",
    })
    await jest.advanceTimersByTimeAsync(60_000)

    expect(execute).not.toHaveBeenCalled()

    scheduler.setOnline(true)
    await jest.advanceTimersByTimeAsync(0)

    expect(execute).toHaveBeenCalledTimes(1)
    scheduler.dispose()
  })

  it("should keep local libraries runnable when one remote library is offline", async () => {
    const execute = jest.fn(async () => {})
    const scheduler = createSidecarSyncScheduler({ execute })
    scheduler.setLibraryOnline("remote-library", false)

    scheduler.request({
      libraryId: "remote-library",
      mode: "push_only",
      reason: "local_change",
      timing: "immediate",
    })
    scheduler.request({
      libraryId: "local-library",
      mode: "push_only",
      reason: "local_change",
      timing: "immediate",
    })
    await jest.advanceTimersByTimeAsync(0)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ libraryId: "local-library" }),
    )

    scheduler.setLibraryOnline("remote-library", true)
    await jest.advanceTimersByTimeAsync(0)

    expect(execute).toHaveBeenCalledTimes(2)
    scheduler.dispose()
  })

  it("should run immediately when pending work is flushed before backgrounding", async () => {
    const execute = jest.fn(async () => {})
    const scheduler = createSidecarSyncScheduler({ execute })

    scheduler.request({
      libraryId: "library-1",
      mode: "push_only",
      reason: "local_change",
      timing: "debounced",
    })
    scheduler.flushPending("library-1", "app_backgrounding")
    await jest.advanceTimersByTimeAsync(0)

    expect(execute).toHaveBeenCalledWith({
      libraryId: "library-1",
      mode: "push_only",
      reasons: ["app_backgrounding", "local_change"],
    })
    scheduler.dispose()
  })
})
