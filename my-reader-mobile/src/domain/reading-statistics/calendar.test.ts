import { buildReadingYearWeeks, readingHeatmapScrollOffset } from "./calendar"

describe("reading statistics calendar", () => {
  it("should build a full Sunday-first year when given a calendar year", () => {
    const weeks = buildReadingYearWeeks(2026)

    expect(weeks.every((week) => week.length === 7)).toBe(true)
    expect(weeks.every((week) => week[0]?.date.getDay() === 0)).toBe(true)
    expect(weeks.flat().filter((day) => day.inYear)).toHaveLength(365)
    expect(weeks.flat().find((day) => day.key === "2026-01-01")?.inYear).toBe(
      true,
    )
  })

  it("should include leap day when building a leap year", () => {
    const days = buildReadingYearWeeks(2024)
      .flat()
      .filter((day) => day.inYear)

    expect(days).toHaveLength(366)
    expect(days.some((day) => day.key === "2024-02-29")).toBe(true)
  })

  it("should place the target week near the trailing edge when the viewport can scroll", () => {
    expect(readingHeatmapScrollOffset(30, 18, 950, 320)).toBe(310)
    expect(readingHeatmapScrollOffset(52, 18, 950, 320)).toBe(630)
    expect(readingHeatmapScrollOffset(2, 18, 950, 320)).toBe(0)
  })
})
