import type { BookDetail } from "@my-reader/tools/types/book";

import i18n from "@/src/i18n";

import { buildCoverUri } from "../data/calibre";
import type { BookItem, Library, WebDavDataSource } from "../data/types";
import { buildWebDavBookCoverUri } from "../data/webdav";

export const IDENTIFIER_LABELS: Record<string, string> = {
  isbn: "ISBN",
  goodreads: "Goodreads",
  douban: "Douban",
  amazon: "Amazon",
  google: "Google",
  barnesnoble: "B&N",
};

export const FORMAT_LABELS: Record<string, string> = {
  EPUB: i18n.t("bookFormats.epub"),
  PDF: i18n.t("bookFormats.pdf"),
  MOBI: i18n.t("bookFormats.mobi"),
  AZW3: i18n.t("bookFormats.azw3"),
  TXT: i18n.t("bookFormats.txt"),
  CBZ: i18n.t("bookFormats.cbz"),
  DJVU: i18n.t("bookFormats.djvu"),
  FB2: "FictionBook",
};

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
  };
  return map[code] ?? code;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (d.getFullYear() <= 100) return "—";
    return d.toLocaleDateString(i18n.language === "zh" ? "zh-CN" : undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function extractYear(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    if (year <= 100) return null;
    return String(year);
  } catch {
    return null;
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
    .trim();
}

export function resolveCoverForDetail(
  library: Library | null,
  detail: BookDetail,
  webDavSource: WebDavDataSource | null,
  fallback?: BookItem["coverUri"]
): BookItem["coverUri"] | undefined {
  if (fallback) return fallback;
  if (!library || !detail.path) return undefined;
  if (library.sourceType === "webdav" && webDavSource) {
    return buildWebDavBookCoverUri(library, webDavSource, detail.path, detail.hasCover);
  }
  return buildCoverUri(library, detail.path, detail.hasCover);
}