export const DEVELOPER_TOOLS_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_PERF_TOOLS === "true"

export const LIBRARY_CARD_SEGMENT_PROFILER_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_LIBRARY_CARD_SEGMENT_PROFILER === "true"

export type LibraryCoverProfilingMode =
  | "normal"
  | "fallback-only"
  | "image-only"

function resolveLibraryCoverProfilingMode(): LibraryCoverProfilingMode {
  if (!DEVELOPER_TOOLS_ENABLED) {
    return "normal"
  }

  const mode = process.env.EXPO_PUBLIC_LIBRARY_COVER_PROFILING_MODE
  if (mode === "fallback-only" || mode === "image-only") {
    return mode
  }

  return "normal"
}

export const LIBRARY_COVER_PROFILING_MODE = resolveLibraryCoverProfilingMode()
