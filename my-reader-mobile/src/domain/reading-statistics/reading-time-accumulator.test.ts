import {
  MAX_READING_POSITION_MS,
  ReadingTimeAccumulator,
  splitReadingIntervalByLocalDay,
} from "./reading-time-accumulator"

describe("ReadingTimeAccumulator", () => {
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
})
