import { lazy, Suspense, useMemo } from "react";

import type { Locator } from "@ryoumon/react-native-readium";

import type { ReaderTheme } from "@/src/store/app-store.types";
import { pageIndexFromFixedLocator } from "@/src/features/reader/components/reader/locator";
import type { ReaderState, ReaderTocItem } from "@/src/features/reader/components/reader/types";
import { toNativeFilesystemPath } from "@/src/utils/io";

const ReadiumFixedReader = lazy(async () => import("./ReadiumFixedReader"));

export type FixedReaderSurfaceProps = {
  archiveUri?: string | null;
  format: string;
  /** PDF：Readium 使用的稳定本地 `file://` URI */
  pdfLocalUri?: string | null;
  initialPage?: number;
  /** 精确阅读位置（固定版式 Readium Locator），优先于 `initialPage`。 */
  initialLocator?: Locator;
  onStateChange: (state: ReaderState) => Promise<void>;
  onTocReady: (toc: ReaderTocItem[]) => Promise<void>;
  onRequestClose: () => Promise<void>;
  onToggleChrome?: () => void;
  gotoPageCommand?: number;
  fallback: React.ReactNode;
  theme?: ReaderTheme;
  brightness?: number;
};

function isPdfFormat(format: string): boolean {
  return format.toUpperCase() === "PDF";
}

function isCbzFormat(format: string): boolean {
  return format.toUpperCase() === "CBZ";
}

export default function FixedReaderSurface({
  archiveUri,
  format,
  pdfLocalUri,
  initialPage,
  initialLocator,
  onStateChange,
  onTocReady,
  onRequestClose,
  onToggleChrome,
  gotoPageCommand,
  fallback,
  theme = "night",
  brightness = 100,
}: FixedReaderSurfaceProps) {
  const domFallback = useMemo(() => fallback, [fallback]);

  if (isCbzFormat(format)) {
    if (!archiveUri) {
      console.error("[fixed-reader-surface] cbz-missing-archive-uri", { format });
      return null;
    }
    const cbzFilePath = toNativeFilesystemPath(archiveUri);
    return (
      <Suspense fallback={domFallback}>
        <ReadiumFixedReader
          filePath={cbzFilePath}
          initialLocator={initialLocator}
          onStateChange={onStateChange}
          onTocReady={onTocReady}
          onRequestClose={onRequestClose}
          onToggleChrome={onToggleChrome}
          gotoPageCommand={gotoPageCommand}
          brightness={brightness}
          theme={theme}
        />
      </Suspense>
    );
  }

  if (isPdfFormat(format)) {
    if (!pdfLocalUri) {
      console.error("[fixed-reader-surface] pdf-missing-local-uri", { format });
      return null;
    }
    const pdfFilePath = toNativeFilesystemPath(pdfLocalUri);
    const effectiveInitialPage = pageIndexFromFixedLocator(initialLocator, initialPage ?? 0);
    const pdfInitialLocator: Locator | undefined = initialLocator ?? (effectiveInitialPage > 0 ? {
      href: "publication.pdf",
      type: "application/pdf",
      locations: {
        position: effectiveInitialPage + 1,
        progression: 0,
        totalProgression: 0,
      },
    } : undefined);
    return (
      <Suspense fallback={domFallback}>
        <ReadiumFixedReader
          filePath={pdfFilePath}
          initialLocator={pdfInitialLocator}
          onStateChange={onStateChange}
          onTocReady={onTocReady}
          onRequestClose={onRequestClose}
          onToggleChrome={onToggleChrome}
          gotoPageCommand={gotoPageCommand}
          brightness={brightness}
          theme={theme}
        />
      </Suspense>
    );
  }

  console.warn("[fixed-reader-surface] unsupported-fixed-format", { format });
  return null;
}
