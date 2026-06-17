import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { ReadiumView } from "@my-reader/readium";
import type {
  Link,
  Locator,
  Preferences,
  PublicationReadyEvent,
  ReadiumFile,
  ReadiumViewRef,
} from "@my-reader/readium";

import { READER_THEMES } from "@/src/design/reader-tokens";
import type { ReaderState, ReaderTocItem } from "@/src/features/reader/components/reader/types";
import type { ReaderTheme, TextAlignment, ColumnCount } from "@/src/store/app-store.types";

const PROGRESS_PERCENT_MULTIPLIER = 100;

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
  theme?: ReaderTheme;
  fontSize?: number;
  lineHeight?: number;
  paddingX?: number;
  brightness?: number;
  textAlign?: TextAlignment;
  columnCount?: ColumnCount;
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
 * Find a platform-native locator from positions list that matches a stored locator.
 * Uses href first (with rough matching for EPUB), then position, then progression.
 */
function resolveNativeLocator(positions: Locator[], stored: Locator): Locator | undefined {
  if (positions.length === 0) return undefined;
  // 1. Match by href (rough matching handles fragment differences)
  const byHref = positions.find((p) => hrefRoughlyMatches(p.href, stored.href));
  if (byHref) return byHref;
  // 2. Match by position
  const position = stored.locations?.position;
  if (typeof position === "number" && position >= 1 && position <= positions.length) {
    return positions[position - 1];
  }
  // 3. Match by progression
  const prog = stored.locations?.totalProgression ?? stored.locations?.progression;
  if (prog != null && Number.isFinite(prog)) {
    const idx = Math.max(0, Math.min(positions.length - 1, Math.round(prog * (positions.length - 1))));
    return positions[idx];
  }
  return undefined;
}

/**
 * Readium `Preferences.theme` 使用 light / dark / sepia（见库类型定义）。
 */
function toReadiumThemeToken(theme: ReaderTheme): "light" | "dark" | "sepia" {
  switch (theme) {
    case "night":
    case "contrast2":
      return "dark";
    case "paper":
    case "sepia":
    case "green":
    case "ocean":
    case "contrast1":
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
  textAlign: TextAlignment,
  columnCount: ColumnCount,
): Preferences {
  const t = READER_THEMES[theme] ?? READER_THEMES.neutral;
  const prefs: Preferences = {
    theme: toReadiumThemeToken(theme),
    fontSize: fontSize / 16,
    lineHeight,
    pageMargins: 0.5 + (paddingX / 100) * 1.5,
    scroll: false,
    textColor: t.fg,
    backgroundColor: t.bg,
    publisherStyles: false,
  };
  if (textAlign !== "auto") {
    prefs.textAlign = textAlign === "justify" ? "justify" : "start";
  }
  if (columnCount !== "auto") {
    prefs.columnCount = columnCount;
  }
  return prefs;
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
      theme = "paper",
      fontSize = 18,
      lineHeight = 1.85,
      paddingX = 20,
      textAlign = "auto",
      columnCount = "auto",
    },
    ref,
  ) {
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
        url: epubPath,
      }),
      [epubPath],
    );

    const preferences = useMemo(
      () => buildPreferences(theme, fontSize, lineHeight, paddingX, textAlign, columnCount),
      [theme, fontSize, lineHeight, paddingX, textAlign, columnCount],
    );

    const handlePublicationReady = useCallback(
      (event: PublicationReadyEvent) => {

        positionsRef.current = event.positions;
        const tocItems = linksToTocItems(event.tableOfContents, event.positions);
        tocItemsRef.current = tocItems;
        onTocReady(tocItems);

        const totalPages = Math.max(1, event.positions.length);

        // Resolve initial position using position/progression from stored locator,
        // then find the matching native locator from positions list.
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

export default ReadiumReflowReader;

const styles = StyleSheet.create({
  reader: {
    flex: 1,
  },
});
