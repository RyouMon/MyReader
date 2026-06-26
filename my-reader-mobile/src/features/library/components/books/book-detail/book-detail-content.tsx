import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isReadableInAppFormat, pickReadableFormat } from "@my-reader/tools/utils";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

import { EmptyState } from "@/src/components/ui";
import {
  enqueue,
  isTaskErrorAlerted,
  markTaskErrorAlerted,
  useDownloadStatusTasks,
} from "@/src/domain/download/download-store";
import { getBookFormatPaths } from "@/src/domain/library/calibre";
import { useFileStates } from "@/src/domain/sync/hooks/use-file-states";
import type { BookItem, DataSource, Library, LocalState } from "@/src/domain/types";
import { isRemoteSourceType } from "@/src/domain/types";
import { describeDownloadError } from "@/src/errors";
import { useBookReadingProgress } from "@/src/domain/library/hooks/use-book-reading-progress";
import {
  formatDate,
  formatLanguage,
  IDENTIFIER_LABELS,
  resolveCoverForDetail,
  stripHtml,
} from "@/src/utils/book-detail";
import { ScrollView, Text, View } from "@/tw";
import type { BookDetail } from "@my-reader/tools/types/book";
import { confirmDeleteLocalDownload } from "../../../utils/delete-download";
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
  dataSources: DataSource[];
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
  dataSources,
}: BookDetailContentProps) {
  const { t } = useTranslation();

  const [coverUri, setCoverUri] = useState<BookItem["coverUri"] | undefined>(listBook?.coverUri);
  const { data: progressByBookId } = useBookReadingProgress(activeLibrary);

  useEffect(() => {
    if (!detail) {
      queueMicrotask(() => setCoverUri(listBook?.coverUri));
      return;
    }
    let cancelled = false;
    void resolveCoverForDetail(activeLibrary, detail, dataSources, listBook?.coverUri)
      .then((resolved) => { if (!cancelled) setCoverUri(resolved); });
    return () => { cancelled = true; };
  }, [activeLibrary, detail, listBook?.coverUri, dataSources]);

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

  useEffect(() => {
    formatInfoMapRef.current = formatInfoMap;
  });

  const { data: fileStateRows = [] } = useFileStates(activeLibrary);
  const downloadStatusTasks = useDownloadStatusTasks();
  const consumedDownloadTaskIdsRef = useRef<Set<string>>(new Set());
  const deletedLocalPathKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!detail || !isRemoteSourceType(activeLibrary.sourceType) || !activeLibrary.dataSourceId) {
      queueMicrotask(() => setFormatInfoMap({}));
      return;
    }
    let cancelled = false;
    void getBookFormatPaths(activeLibrary, detail.id)
      .then((paths) => {
        const map: Record<string, FormatInfo> = {};
        for (const { format, relativePath } of paths) {
          const row = fileStateRows.find((r) => r.path === relativePath);
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
  }, [activeLibrary, bookId, detail, fileStateRows, t]);

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
    (format: string) => {
      const info = formatInfoMap[format];
      if (!info || !detail) return;
      const pathKey = `${activeLibrary.id}${info.relativePath}`;
      confirmDeleteLocalDownload(detail.title, activeLibrary.id, info.relativePath, {
        onConfirm: () => {
          deletedLocalPathKeysRef.current.add(pathKey);
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
        },
        onError: (err) => {
          // Roll back the optimistic update.
          setFormatInfoMap((prev) => ({
            ...prev,
            [format]: { ...prev[format]!, localState: "present" },
          }));
          deletedLocalPathKeysRef.current.delete(pathKey);
          Alert.alert(
            t("bookDetail.deleteLocalFailed"),
            err instanceof Error ? err.message : String(err),
          );
        },
      });
    },
    [formatInfoMap, downloadStatusTasks, activeLibrary.id, detail, t],
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
  const authorsText = book.authors.filter(Boolean).join(", ") || "—";
  const tagsText = book.tags.filter(Boolean).join(", ") || "—";
  const identifierValue = book.identifiers
    .filter((ident) => ident.value.length > 0)
    .map((ident) => `${IDENTIFIER_LABELS[ident.idType] ?? ident.idType}: ${ident.value}`)
    .join("\n");
  const langDisplay = book.languages.map(formatLanguage).join(", ");
  const ratingStars = book.rating ? Math.round(book.rating / 2) : 0;
  const ratingValue = book.rating ? (book.rating / 2).toFixed(1) : null;
  const synopsisText = book.comment ? stripHtml(book.comment) : "";
  const readableSelectedFormat = selectedFormat ?? pickReadableFormat(book.formats);
  const progressByFormat = progressByBookId?.[bookId];
  const detailProgress = readableSelectedFormat
    ? progressByFormat?.[readableSelectedFormat.toUpperCase()]
    : undefined;
  const progress = detailProgress ?? 0;
  const canReadInApp = readableFormats.length > 0;
  const bookInfoRows: InfoCardItem[] = [
    { label: t("bookDetail.bookTitle"), value: book.title },
    { label: t("bookDetail.titleSort"), value: book.titleSort || "—" },
    { label: t("bookDetail.authors"), value: authorsText },
    { label: t("bookDetail.authorSort"), value: book.authorSort || "—" },
    { label: t("bookDetail.series"), value: book.series || "—" },
    { label: t("bookDetail.seriesIndex"), value: book.seriesIndex !== null ? String(book.seriesIndex) : "—" },
    ...(ratingValue ? [{ label: t("bookDetail.rating"), value: `${"★".repeat(ratingStars)}${"☆".repeat(5 - ratingStars)} ${ratingValue}` }] : []),
    { label: t("bookDetail.tags"), value: tagsText },
    { label: t("bookDetail.identifiers"), value: identifierValue || "—" },
    { label: t("bookDetail.createdAt"), value: formatDate(book.timestamp) },
    { label: t("bookDetail.pubDate"), value: formatDate(book.pubdate) },
    { label: t("bookDetail.publisher"), value: book.publisher || "—" },
    { label: t("bookDetail.language"), value: langDisplay || "—" },
  ];

  const selectedFormatUpper = readableSelectedFormat?.toUpperCase() ?? null;
  const selectedFormatInfo = selectedFormatUpper ? formatInfoMap[selectedFormatUpper] : null;
  const isSelectedFormatPresent = selectedFormatInfo?.localState === "present";

  const handleReadAction = () => {
    if (!canReadInApp || !readableSelectedFormat) return;
    if (isRemoteSourceType(activeLibrary.sourceType) && !isSelectedFormatPresent) {
      handleDownloadFormat(readableSelectedFormat);
      Alert.alert(t("bookDetail.downloadStarted"), t("bookDetail.downloadStartedDetail", { format: readableSelectedFormat }));
      return;
    }
    onOpenReader(bookId, readableSelectedFormat);
  };

  const readButtonTitle =
    !canReadInApp || !readableSelectedFormat
      ? t("bookDetail.noReadableFormat")
      : isRemoteSourceType(activeLibrary.sourceType) && !isSelectedFormatPresent
        ? t("bookDetail.downloadAndRead")
        : progress > 0
          ? t("bookDetail.continueReading")
          : t("bookDetail.startReading");

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-8"
        style={{ backgroundColor: colors.background }}
      >
        <View className="gap-5">
          <HeroSection
            book={book}
            canReadInApp={canReadInApp}
            colors={colors}
            coverUri={coverUri}
            formats={readableFormats}
            onRead={handleReadAction}
            onSetFormat={handleSetDefaultFormat}
            readButtonTitle={readButtonTitle}
            selectedFormat={readableSelectedFormat}
          />

          {synopsisText ? (
            <SynopsisSection colors={colors} text={synopsisText} />
          ) : null}

          {book.formats.length > 0 ? (
            <FormatSection
              book={book}
              colors={colors}
              defaultFormat={readableSelectedFormat}
              formatInfoMap={formatInfoMap}
              formatSizeMap={formatSizeMap}
              isNetworkSource={isRemoteSourceType(activeLibrary.sourceType)}
              libraryId={activeLibrary.id}
              onDeleteFormat={(format) => void handleDeleteFormat(format)}
              onDownloadFormat={handleDownloadFormat}
              onSetDefaultFormat={handleSetDefaultFormat}
              progressByFormat={progressByFormat}
              readableFormats={readableFormats}
            />
          ) : null}

          <InfoRowSection items={bookInfoRows} title={t("bookDetail.infoSection")} />
        </View>
      </ScrollView>
    </View>
  );
}
