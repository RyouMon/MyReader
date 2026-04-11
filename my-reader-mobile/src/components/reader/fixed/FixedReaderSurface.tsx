import { lazy, Suspense, useMemo, useState } from "react";

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
  gotoPageCommand?: number;
  fallback: React.ReactNode;
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
  gotoPageCommand,
  fallback,
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
          gotoPageCommand={gotoPageCommand}
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
          gotoPageCommand={gotoPageCommand}
          dom={{
            style: { flex: 1 },
            scrollEnabled: false,
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
