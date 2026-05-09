import { lazy, Suspense, useMemo } from "react";

import type { Locator } from "@ryoumon/react-native-readium";

import type {
  FixedNavigationMode,
  ReadingLayout,
  ReaderTheme,
} from "@/src/store/app-store.types";
import { pageIndexFromFixedLocator } from "@/src/components/reader/locator";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";
import { toNativeFilesystemPath } from "@/src/utils/io";

import NativePdfReader from "./NativePdfReader";

const ReadiumFixedReader = lazy(async () => import("./ReadiumFixedReader"));

export type FixedReaderSurfaceProps = {
  archiveUri?: string | null;
  format: string;
  /** 原生 PDF：`react-native-pdf` 使用的稳定本地 `file://` URI */
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
  readingLayout?: ReadingLayout;
  navigationMode?: FixedNavigationMode;
  theme?: ReaderTheme;
  brightness?: number;
  zoomScale?: number;
  onZoomScaleChange?: (scale: number) => void;
  contentInsetTop?: number;
  contentInsetBottom?: number;
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
  readingLayout = "paginate",
  navigationMode = "horizontal",
  theme = "dark",
  brightness = 100,
  zoomScale = 1,
  onZoomScaleChange,
  contentInsetTop = 0,
  contentInsetBottom = 0,
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
    const effectiveInitialPage = pageIndexFromFixedLocator(initialLocator, initialPage ?? 0);
    return (
      <NativePdfReader
        pdfLocalUri={pdfLocalUri}
        initialPage={effectiveInitialPage}
        onStateChange={onStateChange}
        onTocReady={onTocReady}
        onRequestClose={onRequestClose}
        onToggleChrome={onToggleChrome}
        gotoPageCommand={gotoPageCommand}
        readingLayout={readingLayout}
        navigationMode={navigationMode}
        theme={theme}
        brightness={brightness}
        zoomScale={zoomScale}
        onZoomScaleChange={onZoomScaleChange}
        contentInsetTop={contentInsetTop}
        contentInsetBottom={contentInsetBottom}
      />
    );
  }

  console.warn("[fixed-reader-surface] unsupported-fixed-format", { format });
  return null;
}
