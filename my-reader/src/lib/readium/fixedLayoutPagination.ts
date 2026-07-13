export type FixedLayoutSpread = readonly number[]

export function buildFixedLayoutSpreads(
  totalPages: number,
  doublePage: boolean,
): FixedLayoutSpread[] {
  if (totalPages < 1) return []
  if (!doublePage) {
    return Array.from({ length: totalPages }, (_, index) => [index + 1])
  }

  const spreads: FixedLayoutSpread[] = [[1]]
  for (let page = 2; page <= totalPages; page += 2) {
    spreads.push(page < totalPages ? [page, page + 1] : [page])
  }
  return spreads
}

export function spreadIndexForPage(
  spreads: readonly FixedLayoutSpread[],
  pageNumber: number,
): number {
  if (spreads.length === 0) return 0
  const index = spreads.findIndex((spread) => spread.includes(pageNumber))
  if (index >= 0) return index
  return pageNumber <= 1 ? 0 : spreads.length - 1
}

export function logicalToVisualSpreadIndex(
  logicalIndex: number,
  spreadCount: number,
  direction: "ltr" | "rtl",
): number {
  const clamped = Math.max(0, Math.min(spreadCount - 1, logicalIndex))
  return direction === "rtl" ? spreadCount - 1 - clamped : clamped
}

export function visualToLogicalSpreadIndex(
  visualIndex: number,
  spreadCount: number,
  direction: "ltr" | "rtl",
): number {
  return logicalToVisualSpreadIndex(visualIndex, spreadCount, direction)
}

export function nearestVisualSpreadIndex(
  scrollLeft: number,
  viewportWidth: number,
  spreadCount: number,
): number {
  if (viewportWidth <= 0 || spreadCount < 1) return 0
  return Math.max(
    0,
    Math.min(spreadCount - 1, Math.round(scrollLeft / viewportWidth)),
  )
}
