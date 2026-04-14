import { ProgressController } from "my-reader-tools/reader-core";
import type { ChapterInfo } from "my-reader-tools/types";

const controller = new ProgressController();

/**
 * 复用 tools 中 {@link ProgressController} 的等权章节公式：每页 `contentWeight === 1`，
 * 当前页视为章内读完（`inChapterFraction === 1`）。
 */
export function pdfEqualPageProgressPercent(
  currentPage0Based: number,
  totalPages: number,
): number {
  if (totalPages <= 0) return 0;
  const chapters: ChapterInfo[] = Array.from({ length: totalPages }, (_, i) => ({
    index: i,
    title: "",
    href: "",
    contentWeight: 1,
  }));
  const clampedChapter = Math.min(
    Math.max(0, Math.floor(currentPage0Based)),
    totalPages - 1,
  );
  const p = controller.getProgress({
    chapters,
    currentChapter: clampedChapter,
    inChapterFraction: 1,
  });
  return Math.round(p.fraction * 100);
}
