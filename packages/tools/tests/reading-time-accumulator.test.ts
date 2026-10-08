import { describe, expect, it } from "vitest"

import {
  MAX_READING_POSITION_MS,
  ReadingSessionBatchBuilder,
  ReadingTimeAccumulator,
  splitReadingIntervalByLocalDay,
} from "../src/reading-time-accumulator"

describe("ReadingTimeAccumulator", () => {
  it("ignores inactive time and includes an interval exactly at the five-second boundary", () => {
    const counter = new ReadingTimeAccumulator()
    expect(counter.pulse(30_000)).toBeNull()
    counter.resume(50_000)
    expect(counter.pause(55_000)).toEqual({
      startedAt: 50_000,
      durationMs: 5_000,
    })
    expect(counter.pulse(100_000)).toBeNull()
    expect(counter.locationChanged(110_000)).toBeNull()
  })

  it("rebases after a backwards clock adjustment without recording negative or duplicate time", () => {
    const counter = new ReadingTimeAccumulator()
    counter.resume(10_000)
    expect(counter.pulse(10_000)).toBeNull()
    expect(counter.pulse(5_000)).toBeNull()
    expect(counter.pulse(15_000)).toEqual({
      startedAt: 5_000,
      durationMs: 10_000,
    })
  })

  it("does not invent a session for an absent interval or a subsecond visit", () => {
    const builder = new ReadingSessionBatchBuilder(() => {
      throw new Error("no session expected")
    })
    expect(builder.build(null, 1_000)).toEqual([])
    expect(builder.build({ startedAt: 0, durationMs: 999 }, 999)).toEqual([])
    expect(
      splitReadingIntervalByLocalDay({ startedAt: 0, durationMs: 0 }),
    ).toEqual([])
  })

  it("preserves total whole seconds when a fractional interval crosses midnight", () => {
    const startedAt = new Date(2026, 0, 1, 23, 59, 59, 600).getTime()
    expect(
      splitReadingIntervalByLocalDay({ startedAt, durationMs: 1_500 }),
    ).toEqual([
      {
        localDay: "2026-01-02",
        startedAt: startedAt + 400,
        durationSeconds: 1,
      },
    ])
  })

  it("should cap counted time when the reader stays at one position", () => {
    const counter = new ReadingTimeAccumulator()
    counter.resume(0)

    expect(counter.pulse(30_000)?.durationMs).toBe(30_000)
    expect(counter.pulse(60_000)?.durationMs).toBe(30_000)
    expect(counter.pulse(90_000)?.durationMs).toBe(30_000)
    expect(counter.pulse(MAX_READING_POSITION_MS)?.durationMs).toBe(30_000)
    expect(counter.pulse(150_000)).toBeNull()
  })

  it("should reset the position cap when the reading location changes", () => {
    const counter = new ReadingTimeAccumulator()
    counter.resume(0)
    counter.pulse(MAX_READING_POSITION_MS)

    expect(counter.locationChanged(150_000)).toBeNull()
    expect(counter.pulse(180_000)?.durationMs).toBe(30_000)
  })

  it("should exclude background time and short visits when collecting intervals", () => {
    const counter = new ReadingTimeAccumulator()
    counter.resume(0)

    expect(counter.locationChanged(3_000)).toBeNull()
    expect(counter.pause(13_000)?.durationMs).toBe(10_000)
    counter.resume(100_000)
    expect(counter.pulse(130_000)?.durationMs).toBe(30_000)
  })

  it("should split a reading interval when it crosses local midnight", () => {
    const startedAt = new Date(2026, 0, 1, 23, 59, 55).getTime()

    expect(
      splitReadingIntervalByLocalDay({ startedAt, durationMs: 10_000 }),
    ).toEqual([
      { localDay: "2026-01-01", startedAt, durationSeconds: 5 },
      {
        localDay: "2026-01-02",
        startedAt: startedAt + 5_000,
        durationSeconds: 5,
      },
    ])
  })

  it("should reuse the daily session when multiple intervals are recorded on one day", () => {
    const builder = new ReadingSessionBatchBuilder(() => "session-1")
    const startedAt = new Date(2026, 0, 1, 20, 0).getTime()

    expect(
      builder.build({ startedAt, durationMs: 10_000 }, startedAt + 10_000),
    ).toEqual([
      {
        id: "session-1",
        localDay: "2026-01-01",
        startedAt,
        durationSeconds: 10,
        recordedAt: startedAt + 10_000,
      },
    ])
    expect(
      builder.build(
        { startedAt: startedAt + 20_000, durationMs: 10_000 },
        startedAt + 30_000,
      ),
    ).toEqual([
      {
        id: "session-1",
        localDay: "2026-01-01",
        startedAt,
        durationSeconds: 10,
        recordedAt: startedAt + 30_000,
      },
    ])
  })

  it("should create one daily session when an interval crosses midnight", () => {
    let sequence = 0
    const builder = new ReadingSessionBatchBuilder(
      () => `session-${++sequence}`,
    )
    const startedAt = new Date(2026, 0, 1, 23, 59, 55).getTime()

    expect(
      builder.build({ startedAt, durationMs: 10_000 }, startedAt + 10_000),
    ).toEqual([
      {
        id: "session-1",
        localDay: "2026-01-01",
        startedAt,
        durationSeconds: 5,
        recordedAt: startedAt + 10_000,
      },
      {
        id: "session-2",
        localDay: "2026-01-02",
        startedAt: startedAt + 5_000,
        durationSeconds: 5,
        recordedAt: startedAt + 10_000,
      },
    ])
  })
})
