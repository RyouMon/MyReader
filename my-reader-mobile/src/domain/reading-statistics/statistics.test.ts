import { localDayKey, readingIntensityLevel, yearDayRange } from "./statistics"

describe("reading statistics", () => {
  it("should format a local calendar day when a date is displayed", () => {
    expect(localDayKey(new Date(2024, 1, 29))).toBe("2024-02-29")
    expect(yearDayRange(2024)).toEqual({
      startDay: "2024-01-01",
      endDay: "2024-12-31",
    })
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
