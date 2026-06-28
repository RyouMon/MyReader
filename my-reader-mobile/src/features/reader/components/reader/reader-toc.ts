import type { ReaderTocItem } from "./types"
import i18n from "@/src/i18n"

interface TocItem {
  label: string
  href: string
  index: number
  subitems?: TocItem[]
}

function buildTocItemId(
  prefix: string,
  path: readonly number[],
  rawHref: string | undefined,
) {
  const pathPart = path.join(".")
  return `${prefix}-${pathPart}-${rawHref ?? "no-href"}`
}

export function flattenFixedToc(
  toc: TocItem[],
  totalPages: number,
): ReaderTocItem[] {
  if (toc.length > 0) {
    const items: ReaderTocItem[] = []
    function walk(list: TocItem[], parentPath: number[] = []) {
      for (const [idx, t] of list.entries()) {
        const path = [...parentPath, idx]
        items.push({
          id: buildTocItemId("fixed", path, t.href || undefined),
          label: t.label || `Page ${t.index + 1}`,
          pageIndex: t.index,
          chapterIndex: t.index,
          href: t.href || undefined,
        })
        if (t.subitems?.length) walk(t.subitems, path)
      }
    }
    walk(toc)
    return items
  }
  if (totalPages <= 20) {
    return Array.from({ length: totalPages }, (_, i) => ({
      id: buildTocItemId("fixed-fallback", [i], undefined),
      label: i18n.t("reader.pageLabel", { page: i + 1 }),
      pageIndex: i,
      chapterIndex: i,
    }))
  }
  return []
}

export function flattenReflowToc(toc: TocItem[]): ReaderTocItem[] {
  const items: ReaderTocItem[] = []
  function walk(list: TocItem[], parentPath: number[] = []) {
    for (const [idx, t] of list.entries()) {
      const path = [...parentPath, idx]
      items.push({
        id: buildTocItemId("reflow", path, t.href || undefined),
        label: t.label || `Chapter ${t.index + 1}`,
        pageIndex: Math.max(0, t.index),
        chapterIndex: Math.max(0, t.index),
        href: t.href || undefined,
      })
      if (t.subitems?.length) walk(t.subitems, path)
    }
  }
  walk(toc)

  return items
}
