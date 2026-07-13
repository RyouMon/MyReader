export const BOOK_DETAIL_WIDE_HERO_MIN_WIDTH = 560

const NARROW_COVER_MIN_HEIGHT = 420
const NARROW_COVER_MAX_HEIGHT = 560
const NARROW_COVER_FONT_SCALE_GROWTH = 180

export type BookDetailHeroMode = "narrow" | "wide"

export function resolveBookDetailHeroMode(
  availableWidth: number,
): BookDetailHeroMode {
  return availableWidth >= BOOK_DETAIL_WIDE_HERO_MIN_WIDTH ? "wide" : "narrow"
}

export function resolveBookDetailContentTopInset(
  platform: "android" | "ios" | "macos" | "web" | "windows",
  heroMode: BookDetailHeroMode,
  headerHeight: number,
): number {
  return platform === "android" && heroMode === "wide" ? headerHeight : 0
}

export function resolveNarrowBookDetailCoverHeight(
  availableWidth: number,
  fontScale: number,
): number {
  const baseHeight = Math.min(
    NARROW_COVER_MAX_HEIGHT,
    Math.max(NARROW_COVER_MIN_HEIGHT, availableWidth * 1.35),
  )

  return Math.round(
    baseHeight + Math.max(0, fontScale - 1) * NARROW_COVER_FONT_SCALE_GROWTH,
  )
}
