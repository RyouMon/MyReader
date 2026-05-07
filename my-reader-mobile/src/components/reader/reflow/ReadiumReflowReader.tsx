import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View, type GestureResponderEvent } from "react-native";
import { ReadiumView } from "react-native-readium";
import type {
  Link,
  Locator,
  Preferences,
  PublicationReadyEvent,
  ReadiumFile,
  ReadiumViewRef,
} from "react-native-readium";

import { READER_THEMES } from "@/src/design/reader-tokens";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";
import type { ReaderTheme, ReadingLayout } from "@/src/store/app-store.types";

const PROGRESS_PERCENT_MULTIPLIER = 100;
const TAP_MAX_DRIFT = 12;
const TAP_MAX_DURATION_MS = 260;

type TouchSnapshot = {
  x: number;
  y: number;
  timestampMs: number;
};

export type ReadiumReflowReaderRef = {
  goTo: (locator: Locator) => void;
};

export type ReadiumReflowReaderProps = {
  /** Native filesystem path to the EPUB archive（`toNativeFilesystemPath(fileUri)`）。 */
  epubPath: string;
  /** 自 DB 恢复的 Readium Locator，作为 `ReadiumFile.initialLocation` 传给原生层。 */
  initialLocator?: Locator;
  onStateChange: (state: ReaderState) => void;
  onTocReady: (items: ReaderTocItem[]) => void;
  onRequestClose: () => void;
  onToggleChrome?: () => void;
  /** 与 {@link ReaderTocItem.pageIndex} 一致，由目录 sheet 选择触发。 */
  gotoTocIndex?: number;
  readingLayout?: ReadingLayout;
  theme?: ReaderTheme;
  fontSize?: number;
  lineHeight?: number;
  paddingX?: number;
  brightness?: number;
};

function stripFragment(href: string): string {
  const i = href.indexOf("#");
  return i >= 0 ? href.slice(0, i) : href;
}

function hrefRoughlyMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = stripFragment(a);
  const nb = stripFragment(b);
  return na === nb || na.endsWith(nb) || nb.endsWith(na);
}

/**
 * 为目录链接在 positions 中找首个匹配 locator（用于 TOC `goTo`）。
 */
function findLocatorForLinkHref(positions: Locator[], linkHref: string | undefined): Locator | undefined {
  if (!linkHref || positions.length === 0) return undefined;
  return positions.find((p) => hrefRoughlyMatches(p.href, linkHref));
}

function positionIndexForLocator(positions: Locator[], locator: Locator): number {
  if (positions.length === 0) return 0;
  const byHref = positions.findIndex((p) => hrefRoughlyMatches(p.href, locator.href));
  if (byHref >= 0) return byHref;
  const prog = locator.locations?.totalProgression ?? locator.locations?.progression;
  if (prog != null && Number.isFinite(prog)) {
    return Math.max(0, Math.min(positions.length - 1, Math.round(prog * (positions.length - 1))));
  }
  return 0;
}

/**
 * Readium `Preferences.theme` 使用 light / dark / sepia（见库类型定义）。
 */
function toReadiumThemeToken(theme: ReaderTheme): "light" | "dark" | "sepia" {
  switch (theme) {
    case "dark":
      return "dark";
    case "paper":
    case "green":
      return "sepia";
    default:
      return "light";
  }
}

function buildPreferences(
  theme: ReaderTheme,
  fontSize: number,
  lineHeight: number,
  paddingX: number,
  scroll: boolean,
): Preferences {
  const t = READER_THEMES[theme];
  return {
    theme: toReadiumThemeToken(theme),
    fontSize: fontSize / 16,
    lineHeight,
    pageMargins: 0.5 + (paddingX / 100) * 1.5,
    scroll,
    textColor: t.fg,
    backgroundColor: t.bg,
    publisherStyles: false,
  };
}

function buildTocItemId(prefix: string, path: readonly number[], rawHref: string | undefined) {
  const pathPart = path.join(".");
  return `${prefix}-${pathPart}-${rawHref ?? "no-href"}`;
}

function linksToTocItems(links: Link[], positions: Locator[]): ReaderTocItem[] {
  const items: ReaderTocItem[] = [];
  let flatIndex = 0;

  function walk(list: Link[], parentPath: number[] = []) {
    for (const [idx, link] of list.entries()) {
      const path = [...parentPath, idx];
      const href = link.href;
      const locator = findLocatorForLinkHref(positions, href);
      items.push({
        id: buildTocItemId("readium", path, href),
        label: link.title ?? `Chapter ${flatIndex + 1}`,
        pageIndex: flatIndex,
        chapterIndex: flatIndex,
        href,
        locator,
      });
      flatIndex++;
      if (link.children?.length) {
        walk(link.children, path);
      }
    }
  }

  walk(links);
  return items;
}

const ReadiumReflowReader = forwardRef<ReadiumReflowReaderRef, ReadiumReflowReaderProps>(
  function ReadiumReflowReader(
    {
      epubPath,
      initialLocator,
      onStateChange,
      onTocReady,
      onToggleChrome,
      gotoTocIndex,
      readingLayout = "scroll",
      theme = "paper",
      fontSize = 18,
      lineHeight = 1.85,
      paddingX = 20,
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
        url: epubPath,
        initialLocation: initialLocator,
      }),
      [epubPath, initialLocator],
    );

    const preferences = useMemo(
      () => buildPreferences(theme, fontSize, lineHeight, paddingX, readingLayout === "scroll"),
      [theme, fontSize, lineHeight, paddingX, readingLayout],
    );

    const handlePublicationReady = useCallback(
      (event: PublicationReadyEvent) => {
        console.info("[readium-reflow] publication-ready", {
          title: event.metadata.title,
          tocCount: event.tableOfContents.length,
          positionCount: event.positions.length,
        });

        positionsRef.current = event.positions;
        const tocItems = linksToTocItems(event.tableOfContents, event.positions);
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

        const href = locator.href;
        const tocItems = tocItemsRef.current;
        const matchedToc = tocItems.find((item) => item.href && hrefRoughlyMatches(href, item.href));
        const chapterTitle = locator.title ?? matchedToc?.label ?? "";

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

      const touch = event.nativeEvent.touches[0];
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
      if (gotoTocIndex == null || gotoTocIndex < 0) return;

      const tocItem = tocItemsRef.current[gotoTocIndex];
      if (!tocItem) return;

      const target =
        tocItem.locator ??
        (tocItem.href ? findLocatorForLinkHref(positionsRef.current, tocItem.href) : undefined);
      if (target) {
        readiumRef.current?.goTo(target);
      }
    }, [gotoTocIndex]);

    return (
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
    );
  },
);

export default ReadiumReflowReader;

const styles = StyleSheet.create({
  reader: {
    flex: 1,
  },
});
