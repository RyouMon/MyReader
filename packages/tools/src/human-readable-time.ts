import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime.js"
import "dayjs/locale/zh-cn.js"
import "dayjs/locale/zh-tw.js"
import "dayjs/locale/ja.js"
import "dayjs/locale/ko.js"
import "dayjs/locale/es.js"
import "dayjs/locale/fr.js"
import "dayjs/locale/de.js"
import "dayjs/locale/pt-br.js"
import "dayjs/locale/it.js"
import "dayjs/locale/ru.js"

dayjs.extend(relativeTime)

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const CHINESE_LOCALE = "zh-cn"
const LOCALE_LABELS = {
  en: {
    justNow: "just now",
    yesterday: "yesterday",
    dateFormat: "dddd, MMMM D, YYYY",
  },
  "zh-cn": {
    justNow: "刚刚",
    yesterday: "昨天",
    dateFormat: "YYYY年M月D日dddd",
  },
  "zh-tw": {
    justNow: "剛剛",
    yesterday: "昨天",
    dateFormat: "YYYY年M月D日dddd",
  },
  ja: {
    justNow: "たった今",
    yesterday: "昨日",
    dateFormat: "YYYY年M月D日 dddd",
  },
  ko: { justNow: "방금", yesterday: "어제", dateFormat: "YYYY년 M월 D일 dddd" },
  es: {
    justNow: "ahora mismo",
    yesterday: "ayer",
    dateFormat: "dddd, D [de] MMMM [de] YYYY",
  },
  fr: {
    justNow: "à l’instant",
    yesterday: "hier",
    dateFormat: "dddd D MMMM YYYY",
  },
  de: {
    justNow: "gerade eben",
    yesterday: "gestern",
    dateFormat: "dddd, D. MMMM YYYY",
  },
  "pt-br": {
    justNow: "agora mesmo",
    yesterday: "ontem",
    dateFormat: "dddd, D [de] MMMM [de] YYYY",
  },
  it: { justNow: "adesso", yesterday: "ieri", dateFormat: "dddd D MMMM YYYY" },
  ru: {
    justNow: "только что",
    yesterday: "вчера",
    dateFormat: "dddd, D MMMM YYYY [г.]",
  },
}

function resolveLocale(locale: string): keyof typeof LOCALE_LABELS {
  const [base = "", ...subtags] = locale
    .replace(/_/g, "-")
    .toLowerCase()
    .split("-")
  if (base === "zh") {
    if (subtags.includes("hant")) return "zh-tw"
    if (subtags.includes("hans")) return "zh-cn"
    return subtags.some((tag) => ["tw", "hk", "mo"].includes(tag))
      ? "zh-tw"
      : "zh-cn"
  }
  if (base === "pt") return "pt-br"
  return Object.prototype.hasOwnProperty.call(LOCALE_LABELS, base)
    ? (base as keyof typeof LOCALE_LABELS)
    : "en"
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
  const labels = LOCALE_LABELS[resolvedLocale]
  if (date.isSame(currentDate, "day")) {
    const elapsed = Math.max(0, now - timestamp)
    if (elapsed < MINUTE_MS) {
      return labels.justNow
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
    return labels.yesterday
  }

  return localizedDate.format(labels.dateFormat)
}
