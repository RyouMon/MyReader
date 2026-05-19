import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isReadableInAppFormat, pickReadableFormat } from "@my-reader/tools/utils";
import { Alert } from "react-native";
import { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Button, EmptyState } from "@/src/components/ui";
import { getBookFormatPaths } from "@/src/data/calibre";
import { getFileState, useFileStateRevision, type LocalState } from "@/src/data/file_state";
import type { BookItem, Library, WebDavDataSource } from "@/src/data/types";
import { FONT_UI } from "@/src/design/typography";
import { describeDownloadError } from "@/src/errors";
import {
  dismissTasksForPath,
  enqueue,
  isTaskErrorAlerted,
  markTaskErrorAlerted,
  useDownloadStatusTasks,
} from "@/src/sync/download-store";
import { useSyncActions } from "@/src/sync/useSyncActions";
import {
  extractYear,
  formatDate,
  formatLanguage,
  IDENTIFIER_LABELS,
  resolveCoverForDetail,
} from "@/src/utils/book-detail";
import { AnimatedScrollView, Text, View } from "@/tw";
import type { BookDetail } from "@my-reader/tools/types/book";
import { FormatSection } from "./format-section";
import { HeroSection } from "./hero-section";
import { InfoRowSection } from "./info-row-section";
import { SynopsisSection } from "./synopsis-section";
import type { DetailColors, InfoCardItem } from "./types";

type FormatInfo = { relativePath: string; localState: LocalState | null };

type BookDetailContentProps = {
  activeLibrary: Library;
  bookId: string;
  colors: DetailColors;
  detail: BookDetail | null;
  detailError: string | null;
  listBook: BookItem | null;
  loadingDetail: boolean;
  onOpenReader: (bookId: string, format: string | null) => void;
  onSelectFormat: (bookId: string, format: string | null) => void;
  selectedFormat: string | null;
  webDavSource: WebDavDataSource | null;
};

export function BookDetailContent({
  activeLibrary,
  bookId,
  colors,
  detail,
  detailError,
  listBook,
  loadingDetail,
  onOpenReader,
  onSelectFormat,
  selectedFormat,
  webDavSource,
}: BookDetailContentProps) {
  const { t } = useTranslation();
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.set(event.contentOffset.y);
    },
  });
  const insets = useSafeAreaInsets();

  const coverUri = useMemo(
    () =>
      detail
        ? resolveCoverForDetail(activeLibrary, detail, webDavSource, listBook?.coverUri)
        : listBook?.coverUri,
    [activeLibrary, detail, listBook?.coverUri, webDavSource]
  );

  const progress = typeof listBook?.progress === "number" ? listBook.progress : 0;
  const progressLabel = `${Math.round(progress * 100)}%`;

  const readableFormats = useMemo(
    () => (detail ? detail.formats.filter(isReadableInAppFormat) : []),
    [detail]
  );

  const formatSizeMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!detail) return m;
    for (const fs of detail.formatSizes) {
      m.set(fs.format.toUpperCase(), fs.sizeBytes);
    }
    return m;
  }, [detail]);

  const [formatInfoMap, setFormatInfoMap] = useState<Record<string, FormatInfo>>({});
  const formatInfoMapRef = useRef(formatInfoMap);
  formatInfoMapRef.current = formatInfoMap;

  const syncActions = useSyncActions();
  const fileStateRevision = useFileStateRevision();
  const downloadStatusTasks = useDownloadStatusTasks();
  const consumedDownloadTaskIdsRef = useRef<Set<string>>(new Set());
  const deletedLocalPathKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!detail || activeLibrary.sourceType !== "webdav" || !activeLibrary.dataSourceId) {
      setFormatInfoMap({});
      return;
    }
    let cancelled = false;
    void getBookFormatPaths(activeLibrary, detail.id)
      .then(async (paths) => {
        const map: Record<string, FormatInfo> = {};
        for (const { format, relativePath } of paths) {
          const row = await getFileState(activeLibrary, relativePath);
          map[format] = { relativePath, localState: row?.localState ?? null };
        }
        if (cancelled) return;
        setFormatInfoMap(map);
      })
      .catch((err) => {
        if (!cancelled) {
          Alert.alert(t("bookDetail.readFileStateFailed"), err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeLibrary, bookId, detail, fileStateRevision, t]);

  useEffect(() => {
    if (!detail) return;
    const latestMap = formatInfoMapRef.current;
    const relevantTasks = downloadStatusTasks.filter(
      (task) =>
        task.libraryId === activeLibrary.id &&
        (task.bookId === bookId ||
          Object.values(latestMap).some((info) => info.relativePath === task.relativePath)),
    );

    for (const task of relevantTasks) {
      if (task.status === "error" && !isTaskErrorAlerted(task.id)) {
        markTaskErrorAlerted(task.id);
        const { title, message } = describeDownloadError(task.error ?? t("bookDetail.downloadFailed", { path: task.relativePath }));
        Alert.alert(title, message);
      }
    }

    for (const id of Array.from(consumedDownloadTaskIdsRef.current)) {
      const task = relevantTasks.find((t) => t.id === id);
      if (!task || task.status !== "done") {
        consumedDownloadTaskIdsRef.current.delete(id);
      }
    }

    const doneTasks = relevantTasks.filter(
      (task) =>
        task.status === "done" &&
        !consumedDownloadTaskIdsRef.current.has(task.id) &&
        !deletedLocalPathKeysRef.current.has(`${task.libraryId}${task.relativePath}`),
    );
    if (doneTasks.length === 0) return;

    setFormatInfoMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const task of doneTasks) {
        const format =
          task.format ??
          Object.entries(prev).find(([, info]) => info.relativePath === task.relativePath)?.[0];
        if (!format) continue;
        consumedDownloadTaskIdsRef.current.add(task.id);
        const current = next[format];
        if (current?.localState === "present" && current.relativePath === task.relativePath) continue;
        next[format] = {
          relativePath: current?.relativePath ?? task.relativePath,
          localState: "present",
        };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeLibrary.id, bookId, detail, downloadStatusTasks, t]);

  const handleDownloadFormat = useCallback(
    async (format: string) => {
      const info = formatInfoMap[format];
      if (!info || !detail) {
        Alert.alert(t("bookDetail.cannotStartDownload"), t("bookDetail.noFormatPath", { format }));
        return;
      }
      try {
        await enqueue({
          libraryId: activeLibrary.id,
          bookId,
          format,
          relativePath: info.relativePath,
          label: `${detail.title} · ${format}`,
        });
        deletedLocalPathKeysRef.current.delete(`${activeLibrary.id}${info.relativePath}`);
      } catch (err) {
        const { title, message } = describeDownloadError(err);
        Alert.alert(title, message);
      }
    },
    [formatInfoMap, activeLibrary.id, bookId, detail, t]
  );

  const handleDeleteFormat = useCallback(
    async (format: string) => {
      const info = formatInfoMap[format];
      if (!info) return;
      deletedLocalPathKeysRef.current.add(`${activeLibrary.id}${info.relativePath}`);
      for (const task of downloadStatusTasks) {
        if (
          task.libraryId === activeLibrary.id &&
          task.relativePath === info.relativePath &&
          task.status === "done"
        ) {
          consumedDownloadTaskIdsRef.current.add(task.id);
        }
      }
      // Optimistic update: hide the delete button immediately.
      setFormatInfoMap((prev) => ({
        ...prev,
        [format]: { ...prev[format]!, localState: "remote_only" },
      }));
      try {
        await syncActions.evictLocal(activeLibrary.id, info.relativePath);
        dismissTasksForPath(activeLibrary.id, info.relativePath);
      } catch (err) {
        // Roll back the optimistic update.
        setFormatInfoMap((prev) => ({
          ...prev,
          [format]: { ...prev[format]!, localState: "present" },
        }));
        deletedLocalPathKeysRef.current.delete(`${activeLibrary.id}${info.relativePath}`);
        Alert.alert(t("bookDetail.deleteLocalFailed"), err instanceof Error ? err.message : String(err));
      }
    },
    [formatInfoMap, downloadStatusTasks, activeLibrary.id, syncActions, t]
  );

  const handleSetDefaultFormat = useCallback(
    (format: string) => {
      onSelectFormat(bookId, format);
    },
    [bookId, onSelectFormat]
  );

  if (loadingDetail) {
    return (
      <View className="flex-1 items-center justify-center px-4" style={{ backgroundColor: colors.background }}>
        <Text className="text-sm" style={{ color: colors.palette.textMuted }}>
          {t("bookDetail.loadingDetail")}
        </Text>
      </View>
    );
  }

  if (detailError || !detail) {
    return (
      <View className="flex-1 px-4 pt-4" style={{ backgroundColor: colors.background }}>
        <EmptyState
          title={t("bookDetail.notFound.title")}
          detail={detailError ?? t("bookDetail.notFound.detail")}
        />
      </View>
    );
  }

  const book = detail;
  const year = extractYear(book.pubdate);
  const langDisplay = book.languages.map(formatLanguage).join(", ");
  const ratingStars = book.rating ? Math.round(book.rating / 2) : 0;
  const ratingValue = book.rating ? (book.rating / 2).toFixed(1) : null;
  const seriesLabel =
    book.series && book.seriesIndex !== null && book.seriesIndex !== undefined
      ? t("bookDetail.seriesInfo", { series: book.series, index: Number.isInteger(book.seriesIndex) ? book.seriesIndex : book.seriesIndex.toFixed(1) })
      : book.series;
  const synopsisText = book.comment ? stripHtml(book.comment) : "";
  const readableSelectedFormat = selectedFormat ?? pickReadableFormat(book.formats);
  const canReadInApp = readableFormats.length > 0;
  const metaLine = [year, book.publisher, langDisplay].filter(Boolean).join(" · ");
  const bookInfoRows: InfoCardItem[] = [
    { label: t("bookDetail.authorSort"), value: book.authorSort || "—" },
    { label: t("bookDetail.pubDate"), value: formatDate(book.pubdate) },
    { label: t("bookDetail.language"), value: langDisplay || "—" },
    { label: t("bookDetail.libraryPath"), value: book.path || "—", mono: true },
    { label: t("bookDetail.addedAt"), value: formatDate(book.timestamp) },
    { label: t("bookDetail.lastModified"), value: formatDate(book.lastModified) },
    ...(book.uuid ? [{ label: "UUID", value: book.uuid, mono: true }] : []),
    ...book.identifiers.map((ident) => ({
      label: IDENTIFIER_LABELS[ident.idType] ?? ident.idType,
      value: ident.value,
    })),
  ];

  const selectedFormatUpper = readableSelectedFormat?.toUpperCase() ?? null;
  const selectedFormatInfo = selectedFormatUpper ? formatInfoMap[selectedFormatUpper] : null;
  const isSelectedFormatPresent = selectedFormatInfo?.localState === "present";
  const isSelectedFormatReadable =
    selectedFormatUpper !== null && readableFormats.map((f) => f.toUpperCase()).includes(selectedFormatUpper);

  const handleReadAction = () => {
    if (!canReadInApp || !readableSelectedFormat) return;
    if (activeLibrary.sourceType === "webdav" && !isSelectedFormatPresent) {
      handleDownloadFormat(readableSelectedFormat);
      Alert.alert(t("bookDetail.downloadStarted"), t("bookDetail.downloadStartedDetail", { format: readableSelectedFormat }));
      return;
    }
    onOpenReader(bookId, readableSelectedFormat);
  };

  const readButtonTitle =
    !canReadInApp || !readableSelectedFormat
      ? t("bookDetail.noReadableFormat")
      : activeLibrary.sourceType === "webdav" && !isSelectedFormatPresent
        ? t("bookDetail.downloadAndRead")
        : progress > 0
          ? t("bookDetail.continueReading")
          : t("bookDetail.startReading");

  return (
    <View className="flex-1">
      <AnimatedScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-36"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={{ backgroundColor: colors.background }}
      >
        <View>
          <HeroSection
            book={book}
            colors={colors}
            coverUri={coverUri}
            metaLine={metaLine}
            ratingStars={ratingStars}
            ratingValue={ratingValue}
            seriesLabel={seriesLabel}
          />

          {book.formats.length > 0 ? (
            <FormatSection
              book={book}
              colors={colors}
              defaultFormat={readableSelectedFormat}
              formatInfoMap={formatInfoMap}
              formatSizeMap={formatSizeMap}
              isNetworkSource={activeLibrary.sourceType === "webdav"}
              libraryId={activeLibrary.id}
              onDeleteFormat={(format) => void handleDeleteFormat(format)}
              onDownloadFormat={handleDownloadFormat}
              onSetDefaultFormat={handleSetDefaultFormat}
              progress={progress}
              progressLabel={progressLabel}
              readableFormats={readableFormats}
            />
          ) : null}

          {synopsisText ? (
            <SynopsisSection colors={colors} text={synopsisText} />
          ) : null}

          <InfoRowSection colors={colors} items={bookInfoRows} title={t("bookDetail.infoSection")} />
        </View>
      </AnimatedScrollView>

      {/* Bottom action bar */}
      {canReadInApp && readableSelectedFormat ? (
        <View
          className="absolute bottom-0 left-0 right-0 px-4 pt-3"
          style={{
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            paddingBottom: insets.bottom + 12,
          }}
        >
          <Button
            accessibilityLabel={readButtonTitle}
            className="rounded-2xl"
            colors={{
              backgroundColor: colors.accent,
              borderColor: colors.accent,
              textColor: colors.accentText,
              underlayColor: colors.accentPressed,
            }}
            disabled={!isSelectedFormatReadable}
            onPress={handleReadAction}
            size="lg"
            textStyle={{ fontFamily: FONT_UI }}
            title={readButtonTitle}
            variant="primary"
          />
        </View>
      ) : null}
    </View>
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}
