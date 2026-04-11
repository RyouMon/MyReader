export type ReflowWindowIndex = {
  index: number;
  offset: -1 | 0 | 1;
};

export function buildReflowChapterWindow(
  totalChapters: number,
  currentChapterIndex: number
): ReflowWindowIndex[] {
  if (totalChapters <= 0) {
    return [];
  }

  const current = clampChapterIndex(currentChapterIndex, totalChapters);
  const candidates: ReflowWindowIndex[] = [
    { index: current - 1, offset: -1 },
    { index: current, offset: 0 },
    { index: current + 1, offset: 1 },
  ];

  const seen = new Set<number>();
  return candidates.filter((item) => {
    if (item.index < 0 || item.index >= totalChapters) {
      return false;
    }
    if (seen.has(item.index)) {
      return false;
    }
    seen.add(item.index);
    return true;
  });
}

export function clampChapterIndex(chapterIndex: number, totalChapters: number): number {
  if (totalChapters <= 0) {
    return 0;
  }

  return Math.min(Math.max(0, Math.floor(chapterIndex)), totalChapters - 1);
}
