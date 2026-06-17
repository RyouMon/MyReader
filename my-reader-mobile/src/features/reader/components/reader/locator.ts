import type { Locator } from "@my-reader/readium";

/** 从固定版式 {@link Locator} 解析 0-based 页码：优先 `position`。 */
export function pageIndexFromFixedLocator(
  locator: Locator | undefined | null,
  fallback: number,
): number {
  if (!locator) return fallback;

  const position = locator.locations?.position;
  if (typeof position === "number" && position >= 1) return position - 1;

  return fallback;
}
