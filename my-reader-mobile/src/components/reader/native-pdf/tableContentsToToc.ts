import type { TocItem } from "my-reader-tools/rendition/types";

/**
 * 与 `react-native-pdf` 的 `TableContent` 结构对齐的最小形状（不依赖 RN 包）。
 * 参见 `onLoadComplete` 第 4 个参数。
 */
export type NativePdfTableContentNode = {
  title?: string;
  pageIdx?: number;
  mNativePtr?: number;
  children?: NativePdfTableContentNode[];
};

function clampPageIndex0(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function nodeToTocItem(node: NativePdfTableContentNode): TocItem {
  const index = clampPageIndex0(node.pageIdx);
  const label = node.title?.trim() || `第 ${index + 1} 页`;
  const sub =
    node.children && node.children.length > 0
      ? node.children.map((c) => nodeToTocItem(c))
      : undefined;
  return {
    label,
    href: `#pdf-page-${index}`,
    index,
    subitems: sub,
  };
}

/** 将原生 PDF 目录树转为 {@link TocItem} 树；无法解析时返回空数组。 */
export function tocItemsFromNativePdfTableContents(
  roots: NativePdfTableContentNode[] | null | undefined,
): TocItem[] {
  if (!roots?.length) return [];
  return roots.map((n) => nodeToTocItem(n));
}
