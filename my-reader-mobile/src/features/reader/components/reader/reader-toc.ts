import type { ReaderTocItem } from "./types";

interface TocItem {
  label: string
  href: string
  index: number
  subitems?: TocItem[]
}

function buildTocItemId(prefix: string, path: readonly number[], rawHref: string | undefined) {
  const pathPart = path.join(".");
  return `${prefix}-${pathPart}-${rawHref ?? "no-href"}`;
}


export function flattenFixedToc(toc: TocItem[], totalPages: number): ReaderTocItem[] {
  console.info("[mobile-reader-toc] flatten:start", {
    sourceTocCount: toc.length,
    totalPages,
  });

  if (toc.length > 0) {
    const items: ReaderTocItem[] = [];
    function walk(list: TocItem[], parentPath: number[] = []) {
      for (const [idx, t] of list.entries()) {
        const path = [...parentPath, idx];
        items.push({
          id: buildTocItemId("fixed", path, t.href || undefined),
          label: t.label || `Page ${t.index + 1}`,
          pageIndex: t.index,
          chapterIndex: t.index,
          href: t.href || undefined,
        });
        if (t.subitems?.length) walk(t.subitems, path);
      }
    }
    walk(toc);

    console.info("[mobile-reader-toc] flatten:from-source", {
      flattenedCount: items.length,
      firstItems: items.slice(0, 5),
    });
    return items;
  }
  if (totalPages <= 20) {
    const fallback = Array.from({ length: totalPages }, (_, i) => ({
      id: buildTocItemId("fixed-fallback", [i], undefined),
      label: `第 ${i + 1} 页`,
      pageIndex: i,
      chapterIndex: i,
    }));

    console.info("[mobile-reader-toc] flatten:fallback-pages", {
      flattenedCount: fallback.length,
    });
    return fallback;
  }
  console.info("[mobile-reader-toc] flatten:empty", {
    reason: "no-source-toc-and-too-many-pages-for-fallback",
    totalPages,
  });
  return [];
}

export function flattenReflowToc(toc: TocItem[]): ReaderTocItem[] {
  console.info("[mobile-reader-toc] flatten-reflow:start", {
    sourceTocCount: toc.length,
  });

  const items: ReaderTocItem[] = [];
  function walk(list: TocItem[], parentPath: number[] = []) {
    for (const [idx, t] of list.entries()) {
      const path = [...parentPath, idx];
      items.push({
        id: buildTocItemId("reflow", path, t.href || undefined),
        label: t.label || `Chapter ${t.index + 1}`,
        pageIndex: Math.max(0, t.index),
        chapterIndex: Math.max(0, t.index),
        href: t.href || undefined,
      });
      if (t.subitems?.length) walk(t.subitems, path);
    }
  }
  walk(toc);


  console.info("[mobile-reader-toc] flatten-reflow:done", {
    flattenedCount: items.length,
    firstItems: items.slice(0, 5),
  });

  return items;
}
