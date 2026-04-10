/**
 * Fixed-layout page descriptor for surfaces (PDF / CBZ). URI is the displayable image URL.
 */
export interface FixedPageResource {
  index: number
  uri: string
  width?: number
  height?: number
}

/**
 * Snapshot of window + prefetch state for fixed-layout readers (desktop / mobile).
 */
export interface FixedViewportState {
  currentIndex: number
  totalPages: number
  /** Indices considered “hot” for UI / debugging (visible + preload). */
  windowIndices: number[]
}
