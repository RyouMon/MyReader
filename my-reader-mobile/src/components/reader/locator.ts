import type { Locator } from "react-native-readium";

const PDF_HREF = "publication.pdf";
const PDF_TYPE = "application/pdf";
const COMIC_TYPE = "image/jpeg";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * PDF 当前页 → Readium {@link Locator}。
 *
 * Readium 规范要求：必含 `position`、`progression`、`fragments` 中的 `page=N`，应含 `totalProgression`。
 */
export function pdfPageLocator(input: {
  pageIndex: number;
  totalPages: number;
  title?: string;
}): Locator {
  const total = Math.max(1, input.totalPages);
  const page = Math.max(0, Math.min(Math.floor(input.pageIndex), total - 1));
  const position = page + 1;
  const progression = total > 1 ? page / (total - 1) : 0;
  return {
    href: PDF_HREF,
    type: PDF_TYPE,
    title: input.title,
    locations: {
      fragments: [`page=${position}`],
      progression,
      position,
      totalProgression: progression,
    },
  };
}

/**
 * Comics 当前页 → Readium {@link Locator}。
 *
 * Readium 规范要求：每页是独立 resource，必含 `position`，应含 `totalProgression`。
 */
export function comicPageLocator(input: {
  pageIndex: number;
  totalPages: number;
  title?: string;
}): Locator {
  const total = Math.max(1, input.totalPages);
  const page = Math.max(0, Math.min(Math.floor(input.pageIndex), total - 1));
  const position = page + 1;
  const totalProgression = total > 1 ? page / (total - 1) : 0;
  return {
    href: `page/${position}`,
    type: COMIC_TYPE,
    title: input.title,
    locations: {
      position,
      totalProgression,
    },
  };
}

/** 从固定版式 {@link Locator} 解析 0-based 页码：优先 `position`，回退到 `fragments` 中的 `page=N`。 */
export function pageIndexFromFixedLocator(
  locator: Locator | undefined | null,
  fallback: number,
): number {
  if (!locator) return fallback;

  const position = locator.locations?.position;
  if (typeof position === "number" && position >= 1) return position - 1;

  const fragments = locator.locations?.fragments;
  if (Array.isArray(fragments)) {
    for (const frag of fragments) {
      if (typeof frag !== "string") continue;
      const m = frag.match(/^page=(\d+)/);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n >= 1) return n - 1;
      }
    }
  }

  return fallback;
}

/** 解析 `reading_progress.anchor_json` 列为 {@link Locator}。 */
export function parseStoredLocator(raw: unknown): Locator | null {
  if (!isPlainObject(raw)) return null;
  const { href, type } = raw;
  if (typeof href !== "string" || href.length === 0) return null;
  if (typeof type !== "string" || type.length === 0) return null;
  return raw as unknown as Locator;
}
