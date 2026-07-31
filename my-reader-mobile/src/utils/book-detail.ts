import type { BookDetail } from "@my-reader/tools/types/book"

import i18n from "@/src/i18n"

import { buildCoverUri } from "../domain/library/calibre"
import { createRemoteOps } from "../domain/library/remote-library"
import type { BookItem, DataSource, Library } from "../domain/types"
import { isRemoteSourceType } from "../domain/types"

export { extractYear, formatFileSize } from "@my-reader/tools/book-metadata"

export const IDENTIFIER_LABELS: Record<string, string> = {
  isbn: "ISBN",
  goodreads: "Goodreads",
  douban: "Douban",
  amazon: "Amazon",
  google: "Google",
  barnesnoble: "B&N",
}

export function formatLanguage(code: string): string {
  const map: Record<string, string> = {
    zho: i18n.t("bookLang.zho"),
    chi: i18n.t("bookLang.chi"),
    eng: i18n.t("bookLang.eng"),
    jpn: i18n.t("bookLang.jpn"),
    kor: "한국어",
    fra: "Français",
    deu: "Deutsch",
    spa: "Español",
    rus: "Русский",
  }
  return map[code] ?? code
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  try {
    const d = new Date(dateStr)
    if (d.getFullYear() <= 100) return "—"
    return d.toLocaleDateString(
      i18n.language.startsWith("zh") ? "zh-CN" : undefined,
      {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    )
  } catch {
    return dateStr
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim()
}

export async function resolveCoverForDetail(
  library: Library | null,
  detail: BookDetail,
  dataSources: DataSource[],
  fallback?: BookItem["coverUri"],
): Promise<BookItem["coverUri"] | undefined> {
  if (fallback) return fallback
  if (!library || !detail.path) return undefined
  if (isRemoteSourceType(library.sourceType)) {
    const ops = await createRemoteOps(library, dataSources)
    if (ops) return ops.buildCoverUri(library, detail.path, detail.hasCover)
  }
  return buildCoverUri(library, detail.path, detail.hasCover)
}
