import type { TocItem } from "my-reader-tools/rendition/types";
import type { ReaderTocItem } from "./types";

export function flattenFixedToc(toc: TocItem[], totalPages: number): ReaderTocItem[] {
  console.info("[mobile-reader-toc] flatten:start", {
    sourceTocCount: toc.length,
    totalPages,
  });

  if (toc.length > 0) {
    const items: ReaderTocItem[] = [];
    function walk(list: TocItem[]) {
      for (const t of list) {
        items.push({
          label: t.label || `Page ${t.index + 1}`,
          pageIndex: t.index,
        });
        if (t.subitems?.length) walk(t.subitems);
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
      label: `第 ${i + 1} 页`,
      pageIndex: i,
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
