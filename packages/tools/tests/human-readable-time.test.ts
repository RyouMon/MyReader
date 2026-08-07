import { describe, expect, it, vi } from "vitest"
import { formatHumanReadableTime } from "../src/human-readable-time"

const NOW = new Date(2026, 6, 10, 12, 0).getTime()

describe("human-readable time formatting", () => {
  it("should show just now when the timestamp is recent", () => {
    expect(formatHumanReadableTime(NOW - 30_000, "zh-CN", NOW)).toBe("刚刚")
  })

  it("should show minutes when the timestamp is within an hour", () => {
    expect(formatHumanReadableTime(NOW - 5 * 60_000, "zh-CN", NOW)).toBe(
      "5分钟前",
    )
  })

  it("should show hours when the timestamp is from earlier today", () => {
    expect(formatHumanReadableTime(NOW - 3 * 60 * 60_000, "zh-CN", NOW)).toBe(
      "3小时前",
    )
  })

  it("should show yesterday when the timestamp is from the previous day", () => {
    const now = new Date(2026, 6, 10, 0, 30).getTime()
    const timestamp = new Date(2026, 6, 9, 23, 30).getTime()

    expect(formatHumanReadableTime(timestamp, "zh-CN", now)).toBe("昨天")
  })

  it("should show a localized date when the timestamp is older", () => {
    const timestamp = new Date(2026, 6, 8, 12).getTime()

    expect(formatHumanReadableTime(timestamp, "zh-CN", NOW)).toBe(
      "2026年7月8日星期三",
    )
  })

  it("should return an empty label when the timestamp is invalid", () => {
    expect(formatHumanReadableTime(Number.NaN, "zh-CN", NOW)).toBe("")
    expect(formatHumanReadableTime(0, "zh-CN", NOW)).toBe("")
  })

  it("should localize relative and absolute times when the locale is English", () => {
    expect(formatHumanReadableTime(NOW - 30_000, "en-US", NOW)).toBe("just now")
    expect(formatHumanReadableTime(NOW - 5 * 60_000, "en-US", NOW)).toBe(
      "5 minutes ago",
    )
    expect(
      formatHumanReadableTime(new Date(2026, 6, 9, 12).getTime(), "en-US", NOW),
    ).toBe("yesterday")
    expect(
      formatHumanReadableTime(new Date(2026, 6, 8, 12).getTime(), "en-US", NOW),
    ).toBe("Wednesday, July 8, 2026")
  })

  it("should format Chinese and English when Intl formatters are unavailable", async () => {
    const relativeTimeDescriptor = Object.getOwnPropertyDescriptor(
      Intl,
      "RelativeTimeFormat",
    )
    const dateTimeDescriptor = Object.getOwnPropertyDescriptor(
      Intl,
      "DateTimeFormat",
    )
    Object.defineProperty(Intl, "RelativeTimeFormat", {
      configurable: true,
      writable: true,
      value: undefined,
    })
    Object.defineProperty(Intl, "DateTimeFormat", {
      configurable: true,
      writable: true,
      value: undefined,
    })

    try {
      vi.resetModules()
      const { formatHumanReadableTime: formatWithoutIntl } = await import(
        "../src/human-readable-time"
      )
      expect(formatWithoutIntl(NOW - 5 * 60_000, "zh-CN", NOW)).toBe("5分钟前")
      expect(
        formatWithoutIntl(new Date(2026, 6, 8, 12).getTime(), "en-US", NOW),
      ).toBe("Wednesday, July 8, 2026")
    } finally {
      if (relativeTimeDescriptor) {
        Object.defineProperty(
          Intl,
          "RelativeTimeFormat",
          relativeTimeDescriptor,
        )
      }
      if (dateTimeDescriptor) {
        Object.defineProperty(Intl, "DateTimeFormat", dateTimeDescriptor)
      }
    }
  })
})
