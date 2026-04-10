import type { TocItem } from "my-reader-tools/rendition/types";
import type { ReaderTocItem } from "./types";

export function flattenFixedToc(toc: TocItem[], totalPages: number): ReaderTocItem[] {
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
    return items;
  }
  if (totalPages <= 20) {
    return Array.from({ length: totalPages }, (_, i) => ({
      label: `第 ${i + 1} 页`,
      pageIndex: i,
    }));
  }
  return [];
}
