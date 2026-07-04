import type { ViewabilityConfig } from "react-native"

/** Smallest target width for a grid card before the layout adds another column. */
export const LIBRARY_GRID_MIN_CARD_WIDTH = 150

/** Lower bound for grid columns so narrow phones still render a true book grid. */
export const LIBRARY_GRID_MIN_COLUMNS = 2

/** Upper bound for grid columns; iPad profiling showed six columns is the UX minimum density without exploding per-row work. */
export const LIBRARY_GRID_MAX_COLUMNS = 6

/** Horizontal inset between the screen edge and the outermost grid/list content. */
export const LIBRARY_GRID_PADDING_X = 16

/** Visual gap between adjacent grid cards and grid rows. */
export const LIBRARY_GRID_CARD_GAP = 12

/** Grid cover height / width ratio; thumbnail profiles and BookCard layout must stay in lockstep. */
export const LIBRARY_GRID_COVER_ASPECT_RATIO = 1.43

/** FlashList render-ahead distance for grid mode, expressed in book rows. */
export const LIBRARY_GRID_DRAW_DISTANCE_ROWS = 2

/** Estimated non-cover metadata height below each grid cover, used only to convert row count into FlashList drawDistance. */
export const LIBRARY_GRID_CARD_META_HEIGHT = 64

/** FlashList render-ahead distance for list mode, expressed in book rows. */
export const LIBRARY_LIST_DRAW_DISTANCE_ROWS = 4

/** Estimated list row height, used only to convert row count into FlashList drawDistance. */
export const LIBRARY_LIST_ROW_ESTIMATED_HEIGHT = 108

/** List mode horizontal padding; kept equal to grid padding for visual alignment. */
export const LIBRARY_LIST_PADDING_X = LIBRARY_GRID_PADDING_X

/** Initial grid rows that get high-priority thumbnail generation after first load. */
export const COVER_THUMBNAIL_INITIAL_GRID_ROWS = 4

/** Initial list rows that get high-priority thumbnail generation after first load. */
export const COVER_THUMBNAIL_INITIAL_LIST_ITEMS = 10

/** Extra grid rows around visible cells that can publish existing thumbnail hits and idle warmup work. */
export const COVER_THUMBNAIL_DISPLAY_LOOKAROUND_GRID_ROWS = 2

/** Extra list rows around visible cells that can publish existing thumbnail hits and idle warmup work. */
export const COVER_THUMBNAIL_DISPLAY_LOOKAROUND_LIST_ITEMS = 6

/** Delay after initial FlashList load before expensive thumbnail generation resumes. */
export const COVER_THUMBNAIL_INITIAL_IDLE_DELAY_MS = 80

/** Quiet period after scroll activity before thumbnail generation may resume. */
export const COVER_THUMBNAIL_SCROLL_QUIET_DELAY_MS = 500

/** onScroll cadence; keep the quiet delay above this so generation cannot resume between active scroll events. */
export const LIBRARY_LIST_SCROLL_EVENT_THROTTLE_MS = 250

/** Minimal visibility threshold for thumbnail viewability so nearly-visible covers can hit the cache early. */
export const COVER_THUMBNAIL_VIEWABILITY_PERCENT_THRESHOLD = 1

/** Minimum time a cell must stay viewable before it updates the thumbnail window. */
export const COVER_THUMBNAIL_VIEWABILITY_MINIMUM_TIME_MS = 80

/** Stable FlashList option disabling automatic maintainVisibleContentPosition adjustments for this recycled grid. */
export const LIBRARY_LIST_MAINTAIN_VISIBLE_CONTENT_POSITION = {
  disabled: true,
} as const

/** Stable grid cell wrapper style; avoids allocating a new padding object for every recycled cell. */
export const LIBRARY_GRID_CELL_CONTAINER_STYLE = {
  paddingHorizontal: LIBRARY_GRID_CARD_GAP / 2,
} as const

/** Stable viewability config used to drive thumbnail display/generation windows. */
export const COVER_THUMBNAIL_VIEWABILITY_CONFIG: ViewabilityConfig = {
  itemVisiblePercentThreshold: COVER_THUMBNAIL_VIEWABILITY_PERCENT_THRESHOLD,
  minimumViewTime: COVER_THUMBNAIL_VIEWABILITY_MINIMUM_TIME_MS,
}

/** Delay used to batch generated thumbnail URI publication into fewer React commits. */
export const COVER_THUMBNAIL_GENERATED_FLUSH_DELAY_MS = 80

/** requestIdleCallback timeout for the thumbnail queue so cache generation eventually progresses when idle time is scarce. */
export const COVER_THUMBNAIL_IDLE_TIMEOUT_MS = 350

/** Maximum concurrent thumbnail generation jobs; higher values warm covers faster but compete for native image/IO work. */
export const COVER_THUMBNAIL_GENERATION_CONCURRENCY = 4

/** Lowest developer-configurable thumbnail generation concurrency. */
export const COVER_THUMBNAIL_GENERATION_CONCURRENCY_MIN = 1

/** Highest developer-configurable thumbnail generation concurrency. */
export const COVER_THUMBNAIL_GENERATION_CONCURRENCY_MAX = 8

/** Normalizes developer-configurable thumbnail concurrency before it reaches native image/IO work. */
export function clampCoverThumbnailGenerationConcurrency(concurrency: number) {
  if (!Number.isFinite(concurrency)) {
    return COVER_THUMBNAIL_GENERATION_CONCURRENCY
  }
  return Math.min(
    COVER_THUMBNAIL_GENERATION_CONCURRENCY_MAX,
    Math.max(
      COVER_THUMBNAIL_GENERATION_CONCURRENCY_MIN,
      Math.round(concurrency),
    ),
  )
}

/** JPEG quality for generated thumbnails; balances file size, decode cost, and visible cover quality. */
export const COVER_THUMBNAIL_JPEG_COMPRESS = 0.82

/** Fade duration for the first time a cover image replaces fallback art. */
export const COVER_IMAGE_TRANSITION_MS = 140

/** Enables the cover-loading Skeleton opacity pulse so profiler runs can measure its cost. */
export const COVER_LOADING_SKELETON_PULSE_ENABLED = true

/** Duration for each half of the cover-loading Skeleton pulse. */
export const COVER_LOADING_SKELETON_PULSE_DURATION_MS = 750

/** Number of displayed cover identities remembered so recycled cells can skip fallback flashes when revisiting covers. */
export const COVER_IMAGE_DISPLAYED_CACHE_LIMIT = 3000

/** Number of dynamic cover style sets cached to avoid object allocation in recycled FlashList cells. */
export const COVER_STYLE_CACHE_LIMIT = 1200

/** Interval for aggregated library list profiler summaries in device logs. */
export const LIBRARY_LIST_PROFILER_SUMMARY_INTERVAL_MS = 2000

/** Profiler threshold for render samples consuming roughly half of a 60fps frame. */
export const LIBRARY_LIST_SLOW_RENDER_WARNING_MS = 8

/** Profiler threshold for render samples nearing the 60fps frame danger zone. */
export const LIBRARY_LIST_SLOW_RENDER_RISK_MS = 12

/** Profiler threshold for render samples at the 60fps frame-budget neighborhood. */
export const LIBRARY_LIST_SLOW_RENDER_FRAME_BUDGET_MS = 16
