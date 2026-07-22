import {
  aggregateReadingStatistics,
  longestReadingStreak,
  readingIntensityLevel,
} from "./statistics"

describe("reading statistics", () => {
  it("should aggregate durations, streaks, and completed books when records overlap", () => {
    expect(
      aggregateReadingStatistics(
        [
          { localDay: "2026-01-01", durationSeconds: 600 },
          { localDay: "2026-01-01", durationSeconds: 300 },
          { localDay: "2026-01-02", durationSeconds: 900 },
          { localDay: "2026-01-04", durationSeconds: 120 },
        ],
        [
          { bookId: 1, localDay: "2026-01-01" },
          { bookId: 1, localDay: "2026-01-02" },
          { bookId: 2, localDay: "2026-01-04" },
        ],
      ),
    ).toEqual({
      days: {
        "2026-01-01": 900,
        "2026-01-02": 900,
        "2026-01-04": 120,
      },
      totalDurationSeconds: 1920,
      longestStreakDays: 2,
      completedBooks: 2,
    })
  })

  it("should keep days consecutive when a streak crosses leap-day boundaries", () => {
    expect(
      longestReadingStreak([
        "2024-02-28",
        "2024-02-29",
        "2024-03-01",
        "2024-03-03",
      ]),
    ).toBe(3)
  })

  it.each([
    [0, 0],
    [1, 1],
    [15 * 60, 2],
    [30 * 60, 3],
    [60 * 60, 4],
  ])("should map %i seconds to intensity %i when deriving heatmap levels", (seconds, expected) => {
    expect(readingIntensityLevel(seconds)).toBe(expected)
  })
})
