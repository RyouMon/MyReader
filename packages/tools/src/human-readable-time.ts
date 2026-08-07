import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime.js"
import "dayjs/locale/zh-cn.js"

dayjs.extend(relativeTime)

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const CHINESE_LOCALE = "zh-cn"
const ENGLISH_LOCALE = "en"

function resolveLocale(locale: string): string {
  return locale.toLowerCase().startsWith("zh") ? CHINESE_LOCALE : ENGLISH_LOCALE
}

function relativeLabel(label: string, locale: string): string {
  return locale === CHINESE_LOCALE ? label.replace(/\s+/g, "") : label
}

export function formatHumanReadableTime(
  timestamp: number,
  locale: string,
  now = Date.now(),
): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(now)) {
    return ""
  }

  const date = dayjs(timestamp)
  const currentDate = dayjs(now)
  if (!date.isValid() || !currentDate.isValid()) return ""

  const resolvedLocale = resolveLocale(locale)
  const localizedDate = date.locale(resolvedLocale)
  if (date.isSame(currentDate, "day")) {
    const elapsed = Math.max(0, now - timestamp)
    if (elapsed < MINUTE_MS) {
      return resolvedLocale === CHINESE_LOCALE ? "刚刚" : "just now"
    }
    if (elapsed < HOUR_MS) {
      const minutes = Math.floor(elapsed / MINUTE_MS)
      return relativeLabel(
        currentDate
          .subtract(minutes, "minute")
          .locale(resolvedLocale)
          .from(currentDate),
        resolvedLocale,
      )
    }

    const hours = Math.max(1, Math.floor(elapsed / HOUR_MS))
    return relativeLabel(
      currentDate
        .subtract(hours, "hour")
        .locale(resolvedLocale)
        .from(currentDate),
      resolvedLocale,
    )
  }

  if (date.isSame(currentDate.subtract(1, "day"), "day")) {
    return resolvedLocale === CHINESE_LOCALE ? "昨天" : "yesterday"
  }

  return localizedDate.format(
    resolvedLocale === CHINESE_LOCALE
      ? "YYYY年M月D日dddd"
      : "dddd, MMMM D, YYYY",
  )
}
