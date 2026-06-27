import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { ReadiumView } from "@my-reader/readium";
import type {
  Locator,
  PublicationReadyEvent,
  ReadiumFile,
  ReadiumViewRef,
} from "@my-reader/readium";
import { useTranslation } from "react-i18next";
import i18n from "@/src/i18n";

import type { ReaderState, ReaderTocItem } from "@/src/features/reader/components/reader/types";
import type { FixedNavigationMode, ReadingProgression, Spread } from "@/src/store/app-store.types";

const PROGRESS_PERCENT_MULTIPLIER = 100;

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
  backgroundColor: string;
  navigationMode: FixedNavigationMode;
  readingProgression: ReadingProgression;
  spread: Spread;
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
      label: p.title ?? i18n.t("reader.pageLabel", { page: i + 1 }),
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

/**
 * Find a platform-native locator from positions list that matches a stored locator.
 * Uses position first, then href, then progression — ensuring the returned locator
 * has a href that matches the native publication format.
 */
function resolveNativeLocator(positions: Locator[], stored: Locator): Locator | undefined {
  if (positions.length === 0) return undefined;
  // 1. Match by position (most reliable for cross-platform sync)
  const position = stored.locations?.position;
  if (typeof position === "number" && position >= 1 && position <= positions.length) {
    return positions[position - 1];
  }
  // 2. Match by href (works for same-platform locators)
  const byHref = positions.find((p) => p.href === stored.href);
  if (byHref) return byHref;
  // 3. Match by progression
  const prog = stored.locations?.totalProgression ?? stored.locations?.progression;
  if (prog != null && Number.isFinite(prog)) {
    const idx = Math.max(0, Math.min(positions.length - 1, Math.round(prog * (positions.length - 1))));
    return positions[idx];
  }
  return undefined;
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
      backgroundColor,
      navigationMode,
      readingProgression,
      spread,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const readiumRef = useRef<ReadiumViewRef>(null);
    const tocItemsRef = useRef<ReaderTocItem[]>([]);
    const positionsRef = useRef<Locator[]>([]);
    const currentLocatorRef = useRef<Locator | null>(null);

    useImperativeHandle(ref, () => ({
      goTo: (locator: Locator) => readiumRef.current?.goTo(locator),
    }));

    // Don't pass initialLocator as initialLocation — its href may not match
    // the native publication format. Instead, navigate after publicationReady.
    const file = useMemo<ReadiumFile>(
      () => ({
        url: filePath,
      }),
      [filePath],
    );

    const preferences = useMemo(
      () => ({
        backgroundColor,
        scroll: navigationMode === "vertical",
        readingProgression,
        spread,
      }),
      [backgroundColor, navigationMode, readingProgression, spread],
    );

    const handlePublicationReady = useCallback(
      (event: PublicationReadyEvent) => {

        positionsRef.current = event.positions;
        const tocItems = positionsToTocItems(event.positions);
        tocItemsRef.current = tocItems;
        onTocReady(tocItems);

        const totalPages = Math.max(1, event.positions.length);

        // Resolve initial position using position/progression from stored locator,
        // then find the matching native locator from positions list.
        // This ensures the href matches the platform-native format.
        let startLocator: Locator | undefined = event.positions[0];
        if (initialLocator) {
          const resolved = resolveNativeLocator(event.positions, initialLocator);
          if (resolved) startLocator = resolved;
        } else if (currentLocatorRef.current) {
          const resolved = resolveNativeLocator(event.positions, currentLocatorRef.current);
          if (resolved) startLocator = resolved;
        }
        currentLocatorRef.current = startLocator ?? null;

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
          locator: startLocator,
        });

        // Navigate to the resolved position after the view is ready
        if (startLocator && startLocator !== event.positions[0]) {
          readiumRef.current?.goTo(startLocator);
        }
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
        const chapterTitle = locator.title ?? t("reader.pageLabel", { page: currentPage + 1 });

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

    useEffect(() => {
      if (gotoPageCommand == null || gotoPageCommand < 0) return;

      const tocItem = tocItemsRef.current[gotoPageCommand];
      if (!tocItem) return;

      const target =
        tocItem.locator ??
        (tocItem.href ? positionsRef.current.find((p) => p.href === tocItem.href) : undefined);
      if (target) {
        readiumRef.current?.goTo(target);
      }
    }, [gotoPageCommand]);

    return (
      <View style={styles.reader}>
        <ReadiumView
          ref={readiumRef}
          file={file}
          preferences={preferences}
          style={styles.reader}
          onPublicationReady={handlePublicationReady}
          onLocationChange={handleLocationChange}
          // onTap is emitted by the native navigator; the wrapping View's
          // touch handlers don't receive events on Android because the native
          // reader view consumes them.
          onTap={onToggleChrome}
        />
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
