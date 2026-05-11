import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View, type GestureResponderEvent } from "react-native";
import { ReadiumView } from "@ryoumon/react-native-readium";
import type {
  Locator,
  PublicationReadyEvent,
  ReadiumFile,
  ReadiumViewRef,
} from "@ryoumon/react-native-readium";

import { READER_THEMES } from "@/src/design/reader-tokens";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";
import type { ReaderTheme } from "@/src/store/app-store.types";

const PROGRESS_PERCENT_MULTIPLIER = 100;
const TAP_MAX_DRIFT = 12;
const TAP_MAX_DURATION_MS = 260;

type TouchSnapshot = {
  x: number;
  y: number;
  timestampMs: number;
};

export type ReadiumFixedReaderRef = {
  goTo: (locator: Locator) => void;
};

export type ReadiumFixedReaderProps = {
  /** Native filesystem path to the CBZ archive. */
  filePath: string;
  /** Restored Readium Locator used as `ReadiumFile.initialLocation`. */
  initialLocator?: Locator;
  onStateChange: (state: ReaderState) => void;
  onTocReady: (items: ReaderTocItem[]) => void;
  onRequestClose: () => void;
  onToggleChrome?: () => void;
  /** Page index from TOC sheet selection. */
  gotoPageCommand?: number;
  brightness?: number;
  theme?: ReaderTheme;
};

function buildTocItemId(prefix: string, path: readonly number[]) {
  return `${prefix}-${path.join(".")}`;
}

function positionsToTocItems(positions: Locator[]): ReaderTocItem[] {
  const items: ReaderTocItem[] = [];
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]!;
    items.push({
      id: buildTocItemId("cbz", [i]),
      label: p.title ?? `第 ${i + 1} 页`,
      pageIndex: i,
      chapterIndex: i,
      href: p.href,
      locator: p,
    });
  }
  return items;
}

function positionIndexForLocator(positions: Locator[], locator: Locator): number {
  if (positions.length === 0) return 0;
  const byHref = positions.findIndex((p) => p.href === locator.href);
  if (byHref >= 0) return byHref;
  const position = locator.locations?.position;
  if (typeof position === "number" && position >= 1) {
    return Math.max(0, Math.min(positions.length - 1, position - 1));
  }
  const prog = locator.locations?.totalProgression ?? locator.locations?.progression;
  if (prog != null && Number.isFinite(prog)) {
    return Math.max(0, Math.min(positions.length - 1, Math.round(prog * (positions.length - 1))));
  }
  return 0;
}

const ReadiumFixedReader = forwardRef<ReadiumFixedReaderRef, ReadiumFixedReaderProps>(
  function ReadiumFixedReader(
    {
      filePath,
      initialLocator,
      onStateChange,
      onTocReady,
      onToggleChrome,
      gotoPageCommand,
      brightness = 100,
      theme = "dark",
    },
    ref,
  ) {
    const readiumRef = useRef<ReadiumViewRef>(null);
    const tocItemsRef = useRef<ReaderTocItem[]>([]);
    const positionsRef = useRef<Locator[]>([]);
    const currentLocatorRef = useRef<Locator | null>(initialLocator ?? null);
    const touchStartRef = useRef<TouchSnapshot | null>(null);

    useImperativeHandle(ref, () => ({
      goTo: (locator: Locator) => readiumRef.current?.goTo(locator),
    }));

    const file = useMemo<ReadiumFile>(
      () => ({
        url: filePath,
        initialLocation: initialLocator,
      }),
      [filePath, initialLocator],
    );

    const preferences = useMemo(() => {
      const t = READER_THEMES[theme];
      return {
        theme: (theme === "dark" ? "dark" : "light") as "light" | "dark" | "sepia",
        backgroundColor: t.bg,
      };
    }, [theme]);

    const handlePublicationReady = useCallback(
      (event: PublicationReadyEvent) => {
        console.info("[readium-fixed] publication-ready", {
          title: event.metadata.title,
          tocCount: event.tableOfContents.length,
          positionCount: event.positions.length,
        });

        positionsRef.current = event.positions;
        const tocItems = positionsToTocItems(event.positions);
        tocItemsRef.current = tocItems;
        onTocReady(tocItems);

        const totalPages = Math.max(1, event.positions.length);
        const startLocator = initialLocator ?? currentLocatorRef.current ?? event.positions[0];
        if (startLocator) {
          currentLocatorRef.current = startLocator;
        }

        const currentPage = startLocator
          ? positionIndexForLocator(event.positions, startLocator)
          : 0;
        const progression =
          startLocator?.locations?.totalProgression ?? startLocator?.locations?.progression ?? 0;
        const progress = Math.round(progression * PROGRESS_PERCENT_MULTIPLIER);

        onStateChange({
          ready: true,
          currentPage,
          totalPages,
          progress,
          chapterTitle: event.metadata.title,
          loading: false,
          error: null,
          locator: startLocator ?? undefined,
        });
      },
      [initialLocator, onTocReady, onStateChange],
    );

    const handleLocationChange = useCallback(
      (locator: Locator) => {
        currentLocatorRef.current = locator;

        const positions = positionsRef.current;
        const totalPages = Math.max(1, positions.length);
        const progression =
          locator.locations?.totalProgression ?? locator.locations?.progression ?? 0;
        const progress = Math.round(progression * PROGRESS_PERCENT_MULTIPLIER);

        const currentPage = positionIndexForLocator(positions, locator);
        const chapterTitle = locator.title ?? `第 ${currentPage + 1} 页`;

        onStateChange({
          ready: true,
          currentPage,
          totalPages,
          progress,
          chapterTitle,
          loading: false,
          error: null,
          locator,
        });
      },
      [onStateChange],
    );

    const handleTouchStart = useCallback((event: GestureResponderEvent) => {
      if (event.nativeEvent.touches.length !== 1) {
        touchStartRef.current = null;
        return;
      }

      const touch = event.nativeEvent.touches[0]!;
      touchStartRef.current = {
        x: touch.pageX,
        y: touch.pageY,
        timestampMs: Date.now(),
      };
    }, []);

    const handleTouchEnd = useCallback(
      (event: GestureResponderEvent) => {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start) return;

        const currentTouch = event.nativeEvent.changedTouches[0];
        if (!currentTouch) return;

        const dx = currentTouch.pageX - start.x;
        const dy = currentTouch.pageY - start.y;
        const durationMs = Date.now() - start.timestampMs;
        const isTapGesture =
          Math.abs(dx) <= TAP_MAX_DRIFT &&
          Math.abs(dy) <= TAP_MAX_DRIFT &&
          durationMs <= TAP_MAX_DURATION_MS;

        if (isTapGesture) {
          onToggleChrome?.();
        }
      },
      [onToggleChrome],
    );

    const handleTouchCancel = useCallback(() => {
      touchStartRef.current = null;
    }, []);

    useEffect(() => {
      if (gotoPageCommand == null || gotoPageCommand < 0) return;

      const tocItem = tocItemsRef.current[gotoPageCommand];
      if (!tocItem) return;

      const target = tocItem.locator ?? tocItem.href
        ? positionsRef.current.find((p) => p.href === tocItem.href)
        : undefined;
      if (target) {
        readiumRef.current?.goTo(target);
      }
    }, [gotoPageCommand]);

    return (
      <View style={styles.reader}>
        <View
          style={styles.reader}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
        >
          <ReadiumView
            ref={readiumRef}
            file={file}
            preferences={preferences}
            style={styles.reader}
            onPublicationReady={handlePublicationReady}
            onLocationChange={handleLocationChange}
          />
        </View>
        {brightness < 100 && (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: "black", opacity: (100 - brightness) / 100 },
            ]}
            pointerEvents="none"
          />
        )}
      </View>
    );
  },
);

export default ReadiumFixedReader;

const styles = StyleSheet.create({
  reader: {
    flex: 1,
  },
});
