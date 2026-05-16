import type { BookDetail } from "@my-reader/tools/types/book";

import { buildCoverUri } from "../data/calibre";
import type { BookItem, Library, WebDavDataSource } from "../data/types";
import { buildWebDavBookCoverUri } from "../data/webdav";

export const IDENTIFIER_LABELS: Record<string, string> = {
  isbn: "ISBN",
  goodreads: "Goodreads",
  douban: "豆瓣",
  amazon: "Amazon",
  google: "Google",
  barnesnoble: "B&N",
};

export const FORMAT_LABELS: Record<string, string> = {
  EPUB: "可重排版",
  PDF: "固定版式",
  MOBI: "Kindle 格式",
  AZW3: "Kindle 格式",
  TXT: "纯文本",
  CBZ: "漫画归档",
  DJVU: "扫描文档",
  FB2: "FictionBook",
};

export function formatLanguage(code: string): string {
  const map: Record<string, string> = {
    zho: "中文",
    chi: "中文",
    eng: "English",
    jpn: "日本語",
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
    return d.toLocaleDateString("zh-CN", {
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
