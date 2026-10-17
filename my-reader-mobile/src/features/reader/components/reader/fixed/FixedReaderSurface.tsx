import type { ReaderImageBook } from "@my-reader/tools/reader-image-export"
import { forwardRef, lazy, Suspense, useMemo } from "react"

import type { Locator } from "@my-reader/readium"

import type {
  FixedNavigationMode,
  ReadingProgression,
  Spread,
} from "@/src/store/app-store.types"
import { pageIndexFromFixedLocator } from "@/src/features/reader/components/reader/locator"
import type {
  ReaderState,
  ReaderTocItem,
} from "@/src/features/reader/components/reader/types"
import { toNativeFilesystemPath } from "@/src/services/fs/path"
import type {
  ReadiumFixedReaderRef,
  ReadiumFixedReaderProps,
} from "./ReadiumFixedReader"

const ReadiumFixedReader = lazy(async () => import("./ReadiumFixedReader"))

export type FixedReaderSurfaceProps = {
  imageBook?: ReaderImageBook
  archiveUri?: string | null
  format: string
  /** PDF：Readium 使用的稳定本地 `file://` URI */
  pdfLocalUri?: string | null
  initialPage?: number
  /** 精确阅读位置（固定版式 Readium Locator），优先于 `initialPage`。 */
  initialLocator?: Locator
  onStateChange: (state: ReaderState) => Promise<void>
  onPositionsReady?: (positions: Locator[]) => void
  onUserLocationChange?: ReadiumFixedReaderProps["onUserLocationChange"]
  onTocReady: (toc: ReaderTocItem[]) => Promise<void>
  onRequestClose: () => Promise<void>
  onToggleChrome?: () => void
  fallback: React.ReactNode
  backgroundColor: string
  navigationMode: FixedNavigationMode
  readingProgression: ReadingProgression
  spread: Spread
}

export type FixedReaderSurfaceRef = ReadiumFixedReaderRef

function isPdfFormat(format: string): boolean {
  return format.toUpperCase() === "PDF"
}

function isCbzFormat(format: string): boolean {
  return format.toUpperCase() === "CBZ"
}

const FixedReaderSurface = forwardRef<
  FixedReaderSurfaceRef,
  FixedReaderSurfaceProps
>(function FixedReaderSurface(
  {
    archiveUri,
    imageBook,
    format,
    pdfLocalUri,
    initialPage,
    initialLocator,
    onStateChange,
    onPositionsReady,
    onUserLocationChange,
    onTocReady,
    onRequestClose,
    onToggleChrome,
    fallback,
    backgroundColor,
    navigationMode,
    readingProgression,
    spread,
  },
  ref,
) {
  const domFallback = useMemo(() => fallback, [fallback])

  if (isCbzFormat(format)) {
    if (!archiveUri) {
      console.error("[fixed-reader-surface] cbz-missing-archive-uri", {
        format,
      })
      return null
    }
    const cbzFilePath = toNativeFilesystemPath(archiveUri)
    return (
      <Suspense fallback={domFallback}>
        <ReadiumFixedReader
          ref={ref}
          imageBook={imageBook}
          filePath={cbzFilePath}
          initialLocator={initialLocator}
          onStateChange={onStateChange}
          onPositionsReady={onPositionsReady}
          onUserLocationChange={onUserLocationChange}
          onTocReady={onTocReady}
          onRequestClose={onRequestClose}
          onToggleChrome={onToggleChrome}
          showChapterTitle={false}
          backgroundColor={backgroundColor}
          navigationMode={navigationMode}
          readingProgression={readingProgression}
          spread={spread}
        />
      </Suspense>
    )
  }

  if (isPdfFormat(format)) {
    if (!pdfLocalUri) {
      console.error("[fixed-reader-surface] pdf-missing-local-uri", { format })
      return null
    }
    const pdfFilePath = toNativeFilesystemPath(pdfLocalUri)
    const effectiveInitialPage = pageIndexFromFixedLocator(
      initialLocator,
      initialPage ?? 0,
    )
    const pdfInitialLocator: Locator | undefined =
      initialLocator ??
      (effectiveInitialPage > 0
        ? {
            href: "publication.pdf",
            type: "application/pdf",
            locations: {
              position: effectiveInitialPage + 1,
              progression: 0,
              totalProgression: 0,
            },
          }
        : undefined)
    return (
      <Suspense fallback={domFallback}>
        <ReadiumFixedReader
          ref={ref}
          imageBook={imageBook}
          filePath={pdfFilePath}
          initialLocator={pdfInitialLocator}
          onStateChange={onStateChange}
          onPositionsReady={onPositionsReady}
          onUserLocationChange={onUserLocationChange}
          onTocReady={onTocReady}
          onRequestClose={onRequestClose}
          onToggleChrome={onToggleChrome}
          showChapterTitle
          backgroundColor={backgroundColor}
          navigationMode={navigationMode}
          readingProgression={readingProgression}
          spread={spread}
        />
      </Suspense>
    )
  }

  console.warn("[fixed-reader-surface] unsupported-fixed-format", { format })
  return null
})

export default FixedReaderSurface
