import { lazy, type ComponentProps } from "react"
import type { LoadState } from "@/src/hooks/use-book-loader"
import { toNativeFilesystemPath } from "@/src/services/fs/path"
import { Animated } from "@/tw"

const FixedReaderSurface = lazy(
  async () =>
    import("@/src/features/reader/components/reader/fixed/FixedReaderSurface"),
)
const ReadiumReflowReader = lazy(
  async () =>
    import(
      "@/src/features/reader/components/reader/reflow/ReadiumReflowReader"
    ),
)

export function ReaderPublicationSurface({
  loadState,
  reflowStyle,
  reflow,
  fixed,
}: {
  loadState: Extract<LoadState, { status: "ready" }>
  reflowStyle: ComponentProps<typeof Animated.View>["style"]
  reflow: Omit<
    ComponentProps<typeof ReadiumReflowReader>,
    "epubPath" | "initialLocator"
  >
  fixed: Omit<
    ComponentProps<typeof FixedReaderSurface>,
    "archiveUri" | "pdfLocalUri" | "format" | "initialPage" | "initialLocator"
  >
}) {
  if (loadState.layoutMode === "reflowable") {
    if (!loadState.epubFileUri) return null
    return (
      <Animated.View style={reflowStyle}>
        <ReadiumReflowReader
          {...reflow}
          epubPath={toNativeFilesystemPath(loadState.epubFileUri)}
          initialLocator={loadState.initialLocator ?? undefined}
        />
      </Animated.View>
    )
  }
  if (loadState.layoutMode === "fixedLayout") {
    return (
      <FixedReaderSurface
        {...fixed}
        archiveUri={loadState.bookArchiveUri}
        pdfLocalUri={loadState.pdfLocalUri}
        format={loadState.format}
        initialPage={loadState.initialPage}
        initialLocator={loadState.initialLocator ?? undefined}
      />
    )
  }
  return null
}
