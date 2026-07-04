import { mixInk } from "./color-mix"
import type { ThemePalette } from "./tokens"

type CoverSkeletonPalette = Pick<
  ThemePalette,
  "backgroundSecondary" | "textMuted"
>

/** Percent of muted text mixed into the cover background for the loading Skeleton base color; higher values look darker. */
export const COVER_LOADING_SKELETON_COLOR_MIX_PERCENT = 28

/** Light visual state for cover-loading Skeletons; used as the static state when animation is disabled. */
export const COVER_LOADING_SKELETON_LIGHT_OPACITY = 0.25

/** Dark visual state for cover-loading Skeletons while the pulse animation is running. */
export const COVER_LOADING_SKELETON_DARK_OPACITY = 0.75

export function coverLoadingSkeletonColor(palette: CoverSkeletonPalette) {
  return mixInk(
    palette.textMuted,
    palette.backgroundSecondary,
    COVER_LOADING_SKELETON_COLOR_MIX_PERCENT,
  )
}
