import { lazy, Suspense, useMemo, useState } from "react";

import type {
  FixedNavigationMode,
  ReadingLayout,
  ReaderTheme,
} from "@/src/store/app-store.types";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";

const MobileFixedReader = lazy(async () => import("./MobileFixedReader"));
const FixedLayoutDOMReader = lazy(async () => import("./FixedLayoutDOMReader"));

export type FixedReaderSurfaceProps = {
  bookBase64: string;
  format: string;
  initialPage?: number;
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
  bookBase64,
  format,
  initialPage,
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
  const [domProbeEvents, setDomProbeEvents] = useState<string[]>([]);

  const domFallback = useMemo(() => fallback, [fallback]);

  const handleDomProbe = async (event: {
    stage: string;
    detail?: Record<string, unknown> | null;
  }) => {
    console.info("[fixed-reader-surface] dom-probe", event);
    setDomProbeEvents((prev) => {
      const next = [...prev, `${event.stage}:${JSON.stringify(event.detail ?? {})}`];
      return next.slice(-20);
    });
  };

  if (isCbzFormat(format)) {
    return (
      <Suspense fallback={domFallback}>
        <MobileFixedReader
          bookBase64={bookBase64}
          format={format}
          initialPage={initialPage}
          onStateChange={onStateChange}
          onTocReady={onTocReady}
          onRequestClose={onRequestClose}
          onToggleChrome={onToggleChrome}
          gotoPageCommand={gotoPageCommand}
          navigationMode={navigationMode === "horizontal" ? "horizontal" : "vertical"}
          brightness={brightness}
          zoomScale={zoomScale}
          pinchZoomEnabled
          onZoomScaleChange={onZoomScaleChange}
          contentInsetTop={contentInsetTop}
          contentInsetBottom={contentInsetBottom}
        />
      </Suspense>
    );
  }

  if (isPdfFormat(format)) {
    return (
      <Suspense fallback={domFallback}>
        <FixedLayoutDOMReader
          bookBase64={bookBase64}
          format={format}
          initialPage={initialPage}
          onStateChange={onStateChange}
          onTocReady={onTocReady}
          onDomProbe={handleDomProbe}
          onRequestClose={onRequestClose}
          onToggleChrome={onToggleChrome}
          gotoPageCommand={gotoPageCommand}
          readingLayout={readingLayout}
          theme={theme}
          brightness={brightness}
          zoomScale={zoomScale}
          onZoomScaleChange={onZoomScaleChange}
          dom={{
            style: { flex: 1 },
            scrollEnabled: readingLayout === "scroll",
          }}
        />
      </Suspense>
    );
  }

  console.warn("[fixed-reader-surface] unsupported-fixed-format", {
    format,
    domProbeEventsCount: domProbeEvents.length,
  });
  return null;
}
