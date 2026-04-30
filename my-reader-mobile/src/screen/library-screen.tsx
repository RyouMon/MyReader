import { useEffect, useMemo, useRef, useState } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MenuView, type MenuComponentRef } from "@react-native-menu/menu";
import { FlashList } from "@shopify/flash-list";
import { Stack, router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Platform, TouchableNativeFeedback, View, useWindowDimensions } from "react-native";
import Reanimated, { FadeIn, FadeOut } from "react-native-reanimated";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import { useThemePalette } from "@/src/design/tokens";

import {
  BookCard,
  BookRow,
  EmptyState,
  HeaderToolbar,
  LibrarySkeletonContent,
  PrimaryButton,
  RoundIconButton,
  Screen,
  SearchField,
  SectionHeading,
  type BookDownloadStatus,
  type HeaderToolbarAction,
} from "../components";
import { getAllBookFormats, getBookFormatPaths } from "../data/calibre";
import type { BookItem } from "../data/types";
import { describeDownloadError } from "../errors";
import { notifyLibraryRefresh } from "../notifications/download-notifications";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { useAppStore } from "../store/app-store";
import type { LibraryViewMode } from "../store/app-store.types";
import { useLibraryStore } from "../store/library-store";
import { dismissTasksForPath, enqueue as enqueueDownload, useDownloadStore } from "../sync/download-store";
import { listFileStates, useFileStateRevision, type FileStateRow, type LocalState } from "../sync/file_state";
import { useSyncActions } from "../sync/useSyncActions";

const downloadFilterOptions = [
  { value: "all", label: "全部" },
  { value: "downloaded", label: "已下载" },
  { value: "notDownloaded", label: "未下载" },
  { value: "downloading", label: "正在下载" },
] as const;
const sortOptions = ["书名", "作者", "最近添加"] as const;
const viewOptions: { value: LibraryViewMode; label: string }[] = [
  { value: "grid", label: "网格视图" },
  { value: "list", label: "列表视图" },
];

type DownloadFilterOption = (typeof downloadFilterOptions)[number]["value"];
type SortOption = (typeof sortOptions)[number];
type BookFileStateMap = Record<string, BookDownloadStatus>;
type BookFileStateRowMap = Record<string, FileStateRow[]>;

const defaultSortOption: SortOption = "最近添加";
const downloadedStates = new Set<LocalState>(["present", "local_only", "dirty_push"]);
const readableFormatSet = new Set(["EPUB", "PDF", "CBZ"]);
const GRID_MIN_CARD_WIDTH = 150;
const GRID_MIN_COLUMNS = 2;
const GRID_MAX_COLUMNS = 8;

type LibraryScreenProps = {
  libraryId?: string;
};

/** Renders an Android icon button with native ripple feedback for MenuView triggers. */
function AndroidMenuRippleButton({
  icon,
  menuRef,
  accessibilityLabel,
}: {
  icon: React.ReactNode;
  menuRef: React.RefObject<MenuComponentRef | null>;
  accessibilityLabel?: string;
}) {
  const palette = useThemePalette();
  return (
    <TouchableNativeFeedback
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      background={TouchableNativeFeedback.SelectableBackgroundBorderless()}
      onPress={() => menuRef.current?.show()}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {icon}
      </View>
    </TouchableNativeFeedback>
  );
}

/** Returns the display label for a persisted library view mode. */
function getViewModeLabel(mode: LibraryViewMode) {
  return viewOptions.find((option) => option.value === mode)?.label ?? "网格视图";
}

/** Returns the display label for the active download-state filter. */
function getDownloadFilterLabel(option: DownloadFilterOption) {
  return downloadFilterOptions.find((item) => item.value === option)?.label ?? "全部";
}

/** Computes responsive grid columns so larger screens can show more books per row. */
function getResponsiveGridColumns(containerWidth: number, gap: number, horizontalPadding: number): number {
  const availableWidth = Math.max(0, containerWidth - horizontalPadding * 2);
  const estimatedColumns = Math.floor((availableWidth + gap) / (GRID_MIN_CARD_WIDTH + gap));
  return Math.max(GRID_MIN_COLUMNS, Math.min(GRID_MAX_COLUMNS, estimatedColumns || GRID_MIN_COLUMNS));
}

function pathBelongsToBook(relativePath: string, bookPath?: string): boolean {
  if (!bookPath) return false;
  const normalizedBookPath = bookPath.replace(/^\/+/, "").replace(/\/+$/, "");
  return relativePath === normalizedBookPath || relativePath.startsWith(`${normalizedBookPath}/`);
}

function getFormatFromPath(path: string): string | undefined {
  const match = path.match(/\.([A-Za-z0-9]+)$/);
  return match?.[1]?.toUpperCase();
}

function isReadableFormat(format?: string): format is string {
  return typeof format === "string" && readableFormatSet.has(format.toUpperCase());
}

function getReadableFormats(formats?: string[]): string[] {
  return (formats ?? [])
    .map((format) => format.toUpperCase())
    .filter((format) => readableFormatSet.has(format))
    .sort((left, right) => left.localeCompare(right, "en"));
}

function resolveEffectiveFormat(readableFormats: string[], selectedFormat?: string): string | undefined {
  const normalizedSelected = selectedFormat?.toUpperCase();
  if (normalizedSelected && readableFormats.includes(normalizedSelected)) {
    return normalizedSelected;
  }
  return readableFormats[0];
}

/** Resolves the target format for a download action from a menu action id. */
function resolveDownloadTargetFormat(actionId: string): string | undefined {
  if (actionId === "download") return undefined;
  if (actionId.startsWith("download:")) {
    return actionId.slice("download:".length).toUpperCase();
  }
  return undefined;
}

/** Compares newest Calibre additions first, falling back to id for older rows without timestamps. */
function compareRecentlyAdded(left: BookItem, right: BookItem): number {
  const byTimestamp = (right.timestamp ?? "").localeCompare(left.timestamp ?? "");
  if (byTimestamp !== 0) return byTimestamp;

  const leftId = left.calibreId ?? Number(left.id);
  const rightId = right.calibreId ?? Number(right.id);
  if (Number.isFinite(leftId) && Number.isFinite(rightId)) {
    return rightId - leftId;
  }

  return right.id.localeCompare(left.id, "zh-CN", { numeric: true });
}

export default function LibraryScreen({ libraryId: libraryIdProp }: LibraryScreenProps) {
  const palette = useThemePalette();
  const { width } = useWindowDimensions();
  const GRID_GAP = 12;
  const GRID_PADDING_H = 16;
  const gridColumns = getResponsiveGridColumns(width, GRID_GAP, GRID_PADDING_H);
  const GRID_HALF_GAP = GRID_GAP / 2;
  const LIST_PADDING_H = GRID_PADDING_H;
  const cardWidth = (width - GRID_PADDING_H * 2 - GRID_GAP * (gridColumns - 1)) / gridColumns;
  const { activeLibraryId, libraries, books, loadingBooks, refreshingLibraryId, loading, switchLibrary, error, refreshLibrary } =
    useLibraryStore();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>(defaultSortOption);
  const [downloadFilter, setDownloadFilter] = useState<DownloadFilterOption>("all");
  const [bookFileStates, setBookFileStates] = useState<BookFileStateMap>({});
  const [bookFileStateRows, setBookFileStateRows] = useState<BookFileStateRowMap>({});
  const [selectedFormatById, setSelectedFormatById] = useState<Record<string, string>>({});
  const [bookFormatsById, setBookFormatsById] = useState<Record<string, string[]>>({});
  const fileStateRevision = useFileStateRevision();
  const { tasks: downloadTasks } = useDownloadStore();
  const viewMode = useAppStore((state) => state.libraryViewMode);
  const setViewMode = useAppStore((state) => state.setLibraryViewMode);
  const debouncedQuery = useDebouncedValue(query, 180);
  const isGridView = viewMode === "grid";
  const syncActions = useSyncActions();
  const [openMenuBookId, setOpenMenuBookId] = useState<string | null>(null);
  const menuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRefreshingIdRef = useRef<string | null>(null);

  const isLoadingNewContent = loadingBooks && !refreshingLibraryId;

  function handleMenuOpen(bookId: string) {
    if (menuCloseTimerRef.current) {
      clearTimeout(menuCloseTimerRef.current);
      menuCloseTimerRef.current = null;
    }
    setOpenMenuBookId(bookId);
  }

  function handleMenuClose() {
    menuCloseTimerRef.current = setTimeout(() => {
      setOpenMenuBookId(null);
      menuCloseTimerRef.current = null;
    }, 120);
  }

  /** Switches active library only when user selects a different one. */
  function applyLibrarySelection(nextLibraryId: string) {
    if (nextLibraryId === effectiveLibraryId) {
      return;
    }
    void switchLibrary(nextLibraryId);
  }

  /** Opens a platform-neutral library picker menu without navigation. */
  function openLibrarySwitchMenu() {
    showAlertWithStatusBarRestore(
      "切换书库",
      `当前书库：${selectedLibrary?.name ?? "未选择"}`,
      [
        ...libraries.map((library) => ({
          text: `${effectiveLibraryId === library.id ? "✓ " : ""}${library.name}`,
          onPress: () => applyLibrarySelection(library.id),
        })),
        { text: "关闭", style: "cancel" },
      ]
    );
  }

  const effectiveLibraryId = libraryIdProp ?? activeLibraryId ?? undefined;

  const leftMenuRef = useRef<MenuComponentRef>(null);
  const rightMenuRef = useRef<MenuComponentRef>(null);

  const androidLeftMenuActions = useMemo(
    () => [
      { id: "refreshLibrary", title: "刷新书库" },
      {
        id: "switchLibrary",
        title: "切换书库",
        subactions: libraries.map((library) => ({
          id: `switchLibrary:${library.id}`,
          title: `${effectiveLibraryId === library.id ? "✓ " : ""}${library.name}`,
        })),
      },
    ],
    [libraries, effectiveLibraryId],
  );

  const androidRightMenuActions = useMemo(
    () => [
      {
        id: "filter",
        title: "筛选",
        subactions: downloadFilterOptions.map((option) => ({
          id: `filter:${option.value}`,
          title: `${downloadFilter === option.value ? "✓ " : ""}${option.label}`,
        })),
      },
      {
        id: "sort",
        title: "排序",
        subactions: sortOptions.map((option) => ({
          id: `sort:${option}`,
          title: `${sortBy === option ? "✓ " : ""}${option}`,
        })),
      },
      {
        id: "view",
        title: "视图",
        subactions: viewOptions.map((option) => ({
          id: `view:${option.value}`,
          title: `${viewMode === option.value ? "✓ " : ""}${option.label}`,
        })),
      },
    ],
    [downloadFilter, sortBy, viewMode],
  );

  const selectedLibrary = useMemo(
    () => (effectiveLibraryId ? libraries.find((library) => library.id === effectiveLibraryId) ?? null : null),
    [libraries, effectiveLibraryId]
  );

  function handleAndroidLeftMenuAction(event: string) {
    if (event === "refreshLibrary") {
      if (selectedLibrary) void refreshLibrary(selectedLibrary.id);
      return;
    }
    if (event.startsWith("switchLibrary:")) {
      applyLibrarySelection(event.slice("switchLibrary:".length));
    }
  }

  function handleAndroidRightMenuAction(event: string) {
    if (event.startsWith("filter:")) {
      applyDownloadFilter(event.slice("filter:".length) as DownloadFilterOption);
      return;
    }
    if (event.startsWith("sort:")) {
      applySort(event.slice("sort:".length) as SortOption);
      return;
    }
    if (event.startsWith("view:")) {
      applyView(event.slice("view:".length) as LibraryViewMode);
    }
  }

  useEffect(() => {
    if (!libraryIdProp || !selectedLibrary || libraryIdProp === activeLibraryId) {
      return;
    }

    void switchLibrary(libraryIdProp);
  }, [activeLibraryId, libraryIdProp, selectedLibrary, switchLibrary]);

  useEffect(() => {
    if (!selectedLibrary) {
      setBookFileStates({});
      setBookFileStateRows({});
      return;
    }

    if (selectedLibrary.sourceType !== "webdav" || !selectedLibrary.dataSourceId) {
      setBookFileStates(
        books.reduce<BookFileStateMap>((mapped, book) => {
          mapped[book.id] = "downloaded";
          return mapped;
        }, {}),
      );
      setBookFileStateRows({});
      return;
    }

    let cancelled = false;
    void listFileStates({
      dataSourceId: selectedLibrary.dataSourceId,
      libraryId: selectedLibrary.id,
    }).then((rows) => {
      if (cancelled) return;
      const downloadedRows = rows.filter((row) => downloadedStates.has(row.localState));
      setBookFileStates(
        books.reduce<BookFileStateMap>((mapped, book) => {
          mapped[book.id] = downloadedRows.some((row) => pathBelongsToBook(row.path, book.path))
            ? "downloaded"
            : "notDownloaded";
          return mapped;
        }, {}),
      );
      setBookFileStateRows(
        books.reduce<BookFileStateRowMap>((mapped, book) => {
          mapped[book.id] = rows.filter((row) => pathBelongsToBook(row.path, book.path));
          return mapped;
        }, {}),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [books, fileStateRevision, selectedLibrary]);

  useEffect(() => {
    if (!selectedLibrary) {
      setBookFormatsById({});
      return;
    }
    let cancelled = false;
    void getAllBookFormats(selectedLibrary).then((formats) => {
      if (cancelled) return;
      setBookFormatsById(formats);
    });
    return () => {
      cancelled = true;
    };
  }, [books, selectedLibrary]);

  useEffect(() => {
    if (prevRefreshingIdRef.current !== null && refreshingLibraryId === null) {
      const storeError = useAppStore.getState().error;
      notifyLibraryRefresh(storeError ? "error" : "done", storeError ?? undefined);
    }
    prevRefreshingIdRef.current = refreshingLibraryId;
  }, [refreshingLibraryId]);

  const activeDownloadTasks = useMemo(
    () =>
      downloadTasks.filter(
        (task) =>
          task.libraryId === selectedLibrary?.id &&
          (task.status === "queued" || task.status === "starting" || task.status === "downloading"),
      ),
    [downloadTasks, selectedLibrary?.id],
  );

  const completedDownloadTasks = useMemo(
    () =>
      downloadTasks.filter(
        (task) => task.libraryId === selectedLibrary?.id && task.status === "done",
      ),
    [downloadTasks, selectedLibrary?.id],
  );

  const bookDownloadStatusById = useMemo(() => {
    const next: BookFileStateMap = books.reduce<BookFileStateMap>((mapped, book) => {
      if (selectedLibrary?.sourceType !== "webdav") {
        mapped[book.id] = bookFileStates[book.id] ?? "downloaded";
        return mapped;
      }
      const formats = (bookFormatsById[book.id] ?? []).map((format) => format.toUpperCase());
      const readableFormats = formats.filter((format) => readableFormatSet.has(format));
      const effectiveFormat = resolveEffectiveFormat(readableFormats, selectedFormatById[book.id]);
      const rows = bookFileStateRows[book.id] ?? [];
      const isDownloadedByEffectiveFormat = rows.some((row) => {
        if (!downloadedStates.has(row.localState)) return false;
        const rowFormat = getFormatFromPath(row.path);
        return effectiveFormat ? rowFormat === effectiveFormat : false;
      });
      mapped[book.id] = isDownloadedByEffectiveFormat ? "downloaded" : "notDownloaded";
      return mapped;
    }, {});

    for (const task of completedDownloadTasks) {
      const book = books.find((candidate) =>
        (task.bookId && candidate.id === task.bookId) ||
        pathBelongsToBook(task.relativePath, candidate.path),
      );
      if (!book) continue;
      const formats = (bookFormatsById[book.id] ?? []).map((format) => format.toUpperCase());
      const readableFormats = formats.filter((format) => readableFormatSet.has(format));
      const effectiveFormat = resolveEffectiveFormat(readableFormats, selectedFormatById[book.id]);
      const taskFormat = task.format?.toUpperCase() ?? getFormatFromPath(task.relativePath);
      if (!effectiveFormat || taskFormat !== effectiveFormat) continue;
      next[book.id] = "downloaded";
    }
    for (const task of activeDownloadTasks) {
      const book = books.find((candidate) =>
        (task.bookId && candidate.id === task.bookId) ||
        pathBelongsToBook(task.relativePath, candidate.path),
      );
      if (!book) continue;
      const formats = (bookFormatsById[book.id] ?? []).map((format) => format.toUpperCase());
      const readableFormats = formats.filter((format) => readableFormatSet.has(format));
      const effectiveFormat = resolveEffectiveFormat(readableFormats, selectedFormatById[book.id]);
      const taskFormat = task.format?.toUpperCase() ?? getFormatFromPath(task.relativePath);
      if (!effectiveFormat || taskFormat !== effectiveFormat) continue;
      next[book.id] = task.progress >= 1 ? "downloaded" : "downloading";
    }
    return next;
  }, [
    activeDownloadTasks,
    bookFileStateRows,
    bookFileStates,
    bookFormatsById,
    books,
    completedDownloadTasks,
    selectedLibrary?.sourceType,
    selectedFormatById,
  ]);

  const bookDownloadProgressById = useMemo(() => {
    const next: Record<string, number> = {};
    for (const task of activeDownloadTasks) {
      const book = books.find((candidate) =>
        (task.bookId && candidate.id === task.bookId) ||
        pathBelongsToBook(task.relativePath, candidate.path),
      );
      if (!book) continue;
      const formats = (bookFormatsById[book.id] ?? []).map((format) => format.toUpperCase());
      const readableFormats = formats.filter((format) => readableFormatSet.has(format));
      const effectiveFormat = resolveEffectiveFormat(readableFormats, selectedFormatById[book.id]);
      const taskFormat = task.format?.toUpperCase() ?? getFormatFromPath(task.relativePath);
      if (!effectiveFormat || taskFormat !== effectiveFormat) continue;
      next[book.id] = task.progress;
    }
    return next;
  }, [activeDownloadTasks, bookFormatsById, books, selectedFormatById]);

  const visibleBooks = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    const searchedBooks = !needle
      ? books
      : books.filter((book) => {
          const authorMatches = book.authors?.some((author) => author.toLowerCase().includes(needle));
          return (
            book.title.toLowerCase().includes(needle) ||
            book.author.toLowerCase().includes(needle) ||
            Boolean(authorMatches)
          );
        });
    const filteredBooks =
      downloadFilter === "all"
        ? searchedBooks
        : searchedBooks.filter(
            (book) => (bookDownloadStatusById[book.id] ?? "notDownloaded") === downloadFilter,
          );

    return [...filteredBooks].sort((left, right) => {
      switch (sortBy) {
        case "作者":
          return left.author.localeCompare(right.author, "zh-CN");
        case "最近添加":
          return compareRecentlyAdded(left, right);
        case "书名":
        default:
          return left.title.localeCompare(right.title, "zh-CN");
      }
    });
  }, [books, bookDownloadStatusById, debouncedQuery, downloadFilter, sortBy]);

  async function handleBookPress(book: BookItem, fromMenu = false) {
    if (openMenuBookId && !fromMenu) {
      return;
    }
    const status = bookDownloadStatusById[book.id] ?? "notDownloaded";

    if (selectedLibrary?.sourceType !== "webdav" || status === "downloaded") {
      const effectiveFormat = resolveEffectiveFormat(
        getReadableFormats(bookFormatsById[book.id]),
        selectedFormatById[book.id],
      );
      if (effectiveFormat) {
        router.push({ pathname: "/reader/[id]", params: { id: book.id, format: effectiveFormat } });
      } else {
        router.push({ pathname: "/reader/[id]", params: { id: book.id } });
      }
      return;
    }

    const calibreId = Number(book.id);
    if (!Number.isFinite(calibreId) || calibreId <= 0) return;

    try {
      const paths = await getBookFormatPaths(selectedLibrary, calibreId);
      const format = resolveEffectiveFormat(
        getReadableFormats(paths.map((path) => path.format)),
        selectedFormatById[book.id],
      );
      if (!format) {
        showAlertWithStatusBarRestore("无法阅读", "该书没有可阅读的格式");
        return;
      }
      const match = paths.find((p) => p.format.toUpperCase() === format.toUpperCase());
      if (!match) return;

      await enqueueDownload({
        libraryId: selectedLibrary.id,
        bookId: book.id,
        format,
        relativePath: match.relativePath,
        label: `${book.title} · ${format}`,
      });
    } catch (e) {
      const { title, message } = describeDownloadError(e);
      showAlertWithStatusBarRestore(title, message);
    }
  }

  async function handleSetDefaultFormat(book: BookItem) {
    const calibreId = Number(book.id);
    if (!Number.isFinite(calibreId) || calibreId <= 0 || !selectedLibrary) return;

    try {
      const paths = await getBookFormatPaths(selectedLibrary, calibreId);
      const readableFormats = getReadableFormats(paths.map((path) => path.format));

      if (readableFormats.length === 0) {
        showAlertWithStatusBarRestore("无可读格式", "该书没有可阅读的格式");
        return;
      }
      if (readableFormats.length === 1) {
        setSelectedFormatById((prev) => ({ ...prev, [book.id]: readableFormats[0] }));
        showAlertWithStatusBarRestore("已设置默认格式", readableFormats[0]);
        return;
      }

      const current = selectedFormatById[book.id];
      const effectiveFormat = resolveEffectiveFormat(readableFormats, current);
      showAlertWithStatusBarRestore(
        "设置默认阅读格式",
        `当前默认：${effectiveFormat ?? "-"}`,
        [
          ...readableFormats.map((fmt) => ({
            text: `${effectiveFormat === fmt ? "✓ " : ""}${fmt}`,
            onPress: () => setSelectedFormatById((prev) => ({ ...prev, [book.id]: fmt })),
          })),
          { text: "取消", style: "cancel" },
        ],
      );
    } catch (e) {
      showAlertWithStatusBarRestore("读取格式失败", e instanceof Error ? e.message : String(e));
    }
  }

  /** Enqueues a download task for the selected book format. */
  async function handleDownloadBook(book: BookItem, targetFormat?: string) {
    const calibreId = Number(book.id);
    if (!Number.isFinite(calibreId) || calibreId <= 0 || !selectedLibrary || selectedLibrary.sourceType !== "webdav") return;

    try {
      const paths = await getBookFormatPaths(selectedLibrary, calibreId);
      const readableFormats = getReadableFormats(paths.map((path) => path.format));
      const normalizedTarget = targetFormat?.toUpperCase();
      const format = normalizedTarget
        ? readableFormats.find((item) => item === normalizedTarget)
        : resolveEffectiveFormat(readableFormats, selectedFormatById[book.id]);
      if (!format) {
        showAlertWithStatusBarRestore("无法下载", "该书没有可下载的可读格式");
        return;
      }
      const match = paths.find((p) => p.format.toUpperCase() === format);
      if (!match) return;

      await enqueueDownload({
        libraryId: selectedLibrary.id,
        bookId: book.id,
        format,
        relativePath: match.relativePath,
        label: `${book.title} · ${format}`,
      });
    } catch (e) {
      const { title, message } = describeDownloadError(e);
      showAlertWithStatusBarRestore(title, message);
    }
  }

  function buildBookMenuActions(
    book: BookItem,
    downloadStatus: BookDownloadStatus,
    formats: string[] | undefined,
    currentFormat: string | undefined,
  ): import("@react-native-menu/menu").MenuAction[] {
    const actions: import("@react-native-menu/menu").MenuAction[] = [
      { id: "detail", title: "图书详情" },
    ];

    const readableFormats = getReadableFormats(formats);
    const effectiveFormat = resolveEffectiveFormat(readableFormats, currentFormat);
    if (selectedLibrary?.sourceType === "webdav" && downloadStatus !== "downloaded") {
      if (readableFormats.length === 1) {
        actions.push({
          id: `download:${readableFormats[0]}`,
          title: `下载（${readableFormats[0]}）`,
        });
      } else if (readableFormats.length > 1) {
        actions.push({
          id: "download",
          title: "下载",
          subactions: readableFormats.map((fmt) => ({
            id: `download:${fmt}`,
            title: fmt,
          })),
        });
      }
    }
    const formatSubactions: import("@react-native-menu/menu").MenuAction[] = [];
    if (readableFormats.length > 0) {
      for (const fmt of readableFormats) {
        formatSubactions.push({
          id: `setDefaultFormat:${fmt}`,
          title: `${effectiveFormat === fmt ? "✓ " : ""}${fmt}`,
        });
      }
    }

    if (readableFormats.length > 1) {
      actions.push({
        id: "setDefaultFormat",
        title: `默认阅读格式：${effectiveFormat ?? "-"}`,
        subactions: formatSubactions.length > 0 ? formatSubactions : undefined,
      });
    }

    if (selectedLibrary?.sourceType === "webdav" && downloadStatus === "downloaded") {
      actions.push({
        id: "deleteDownload",
        title: "删除下载文件",
        attributes: { destructive: true },
      });
    }
    return actions;
  }

  function handleBookMenuAction(book: BookItem, actionId: string) {
    if (actionId === "download" || actionId.startsWith("download:")) {
      const targetFormat = resolveDownloadTargetFormat(actionId);
      void handleDownloadBook(book, targetFormat);
      return;
    }
    if (actionId === "detail") {
      router.push({ pathname: "/library-book/[id]", params: { id: book.id } });
      return;
    }
    if (actionId.startsWith("setDefaultFormat:")) {
      const format = actionId.slice("setDefaultFormat:".length);
      if (format === "auto") {
        setSelectedFormatById((prev) => {
          const next = { ...prev };
          delete next[book.id];
          return next;
        });
      } else {
        setSelectedFormatById((prev) => ({ ...prev, [book.id]: format }));
      }
      return;
    }
    if (actionId === "setDefaultFormat") {
      void handleSetDefaultFormat(book);
      return;
    }
    if (actionId === "deleteDownload") {
      const rows = bookFileStateRows[book.id] ?? [];
      const downloadedRows = rows.filter((row) => downloadedStates.has(row.localState));
      if (downloadedRows.length === 0) return;
      showAlertWithStatusBarRestore(
        "删除下载文件",
        `确定要删除《${book.title}》的本地下载文件吗？`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "删除",
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  for (const row of downloadedRows) {
                    await syncActions.evictLocal(selectedLibrary!.id, row.path);
                    dismissTasksForPath(selectedLibrary!.id, row.path);
                  }
                } catch (err) {
                  showAlertWithStatusBarRestore("删除失败", err instanceof Error ? err.message : String(err));
                }
              })();
            },
          },
        ],
      );
    }
  }

  function applySort(option: SortOption) {
    setSortBy(option);
  }

  function applyView(option: LibraryViewMode) {
    setViewMode(option);
  }

  function applyDownloadFilter(option: DownloadFilterOption) {
    setDownloadFilter(option);
  }

  const emptyLibrariesToolbarRight: HeaderToolbarAction[] = [
    {
      label: "添加书库",
      onPress: () => router.push("/settings/add-library"),
      icon: <SymbolView name="plus" size={18} tintColor={palette.text} />,
      iosSfSymbol: "plus",
    },
  ];

  const unselectedLibraryToolbarRight: HeaderToolbarAction[] = [
    {
      label: "切换书库",
      onPress: openLibrarySwitchMenu,
      icon: <SymbolView name="arrow.left.arrow.right" size={18} tintColor={palette.text} />,
      iosSfSymbol: "arrow.left.arrow.right",
    },
    {
      label: "添加书库",
      onPress: () => router.push("/settings/add-library"),
      icon: <SymbolView name="plus" size={18} tintColor={palette.text} />,
      iosSfSymbol: "plus",
    },
  ];

  if (loading && typeof effectiveLibraryId === "string" && !selectedLibrary) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "书库",
            headerLargeTitle: true,
          }}
        />
        <Screen>
          <EmptyState title="正在加载书库" detail="正在读取本地与 WebDAV 书库配置。" />
        </Screen>
      </>
    );
  }

  const showInvalidLibrary =
    typeof effectiveLibraryId === "string" &&
    !selectedLibrary &&
    !loading &&
    libraries.length > 0;

  if (showInvalidLibrary) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "书库",
            headerLargeTitle: true,
          }}
        />
        <Screen>
          <EmptyState title="没有找到这个书库" detail="它可能已被移除，或链接参数已经失效。" />
        </Screen>
      </>
    );
  }

  if (!loading && libraries.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "书库",
            headerLargeTitle: true,
            headerLargeTitleShadowVisible: false,
          }}
        />
        <HeaderToolbar right={emptyLibrariesToolbarRight} />
        <Screen>
          <EmptyState
            title="还没有添加书库"
            detail="先添加一个 Calibre 书库，之后即可在书库标签中浏览图书。"
            action={<PrimaryButton title="添加书库" onPress={() => router.push("/settings/add-library")} />}
          />
        </Screen>
      </>
    );
  }

  if (loading && libraries.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "书库",
            headerLargeTitle: true,
          }}
        />
        <Screen>
          <EmptyState title="正在加载书库" detail="正在读取本地与 WebDAV 书库配置。" />
        </Screen>
      </>
    );
  }

  if (!selectedLibrary) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "书库",
            headerLargeTitle: true,
          }}
        />
        <HeaderToolbar right={unselectedLibraryToolbarRight} />
        <Screen>
          <EmptyState
            title="未选择书库"
            detail="请选择要浏览的书库，或添加新的 Calibre 书库。"
            action={
              <RoundIconButton
                label="切换书库"
                onPress={openLibrarySwitchMenu}
                icon={<MaterialIcons name="swap-horiz" size={22} color={palette.text} />}
              />
            }
          />
        </Screen>
      </>
    );
  }

  const listHeader = (
    <View style={{ gap: 20, marginBottom: isGridView ? 8 : 0, paddingHorizontal: isGridView ? 0 : LIST_PADDING_H }}>
      <SearchField placeholder="搜索书名、作者、标签" value={query} onChangeText={setQuery} />
      <SectionHeading
        title={getDownloadFilterLabel(downloadFilter)}
        detail={`${visibleBooks.length} / ${books.length} 本`}
      />
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: selectedLibrary.name,
          headerLargeTitle: true,
          headerLeft:
            Platform.OS !== "ios"
              ? () => (
                  <View style={{ width: 40, height: 40 }}>
                    <MenuView
                      ref={leftMenuRef}
                      actions={androidLeftMenuActions}
                      onPressAction={({ nativeEvent }) => handleAndroidLeftMenuAction(nativeEvent.event)}
                      style={{ position: "absolute", top: 0, left: 0, width: 40, height: 40, opacity: 0 }}
                    >
                      <View style={{ width: 40, height: 40 }} />
                    </MenuView>
                    <AndroidMenuRippleButton
                      menuRef={leftMenuRef}
                      icon={<MaterialIcons name="more-vert" size={22} color={palette.text} />}
                      accessibilityLabel="书库操作"
                    />
                  </View>
                )
              : undefined,
          headerRight:
            Platform.OS !== "ios"
              ? () => (
                  <View style={{ width: 40, height: 40 }}>
                    <MenuView
                      ref={rightMenuRef}
                      actions={androidRightMenuActions}
                      isAnchoredToRight
                      onPressAction={({ nativeEvent }) => handleAndroidRightMenuAction(nativeEvent.event)}
                      style={{ position: "absolute", top: 0, left: 0, width: 40, height: 40, opacity: 0 }}
                    >
                      <View style={{ width: 40, height: 40 }} />
                    </MenuView>
                    <AndroidMenuRippleButton
                      menuRef={rightMenuRef}
                      icon={<MaterialIcons name="tune" size={22} color={palette.text} />}
                      accessibilityLabel="视图配置"
                    />
                  </View>
                )
              : undefined,
        }}
      />
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Menu icon="ellipsis">
            <Stack.Toolbar.MenuAction
              onPress={() => {
                if (selectedLibrary) void refreshLibrary(selectedLibrary.id);
              }}
            >
              更新当前书库
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.Menu inline title="切换书库">
              {libraries.map((library) => (
                <Stack.Toolbar.MenuAction
                  key={`library-${library.id}`}
                  isOn={effectiveLibraryId === library.id}
                  onPress={() => applyLibrarySelection(library.id)}
                >
                  {library.name}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : null}
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon="line.3.horizontal.decrease">
            <Stack.Toolbar.Menu inline title="筛选">
              {downloadFilterOptions.map((option) => (
                <Stack.Toolbar.MenuAction
                  key={`download-filter-${option.value}`}
                  isOn={downloadFilter === option.value}
                  onPress={() => applyDownloadFilter(option.value)}
                >
                  {option.label}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
            <Stack.Toolbar.Menu inline title="排序">
              {sortOptions.map((option) => (
                <Stack.Toolbar.MenuAction key={`sort-${option}`} isOn={sortBy === option} onPress={() => applySort(option)}>
                  {option}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
            <Stack.Toolbar.Menu inline title="视图">
              {viewOptions.map((option) => (
                <Stack.Toolbar.MenuAction
                  key={`view-${option.value}`}
                  isOn={viewMode === option.value}
                  onPress={() => applyView(option.value)}
                >
                  {option.label}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : null}
      <Reanimated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={{ flex: 1 }}>
        <FlashList
          key={`${viewMode}-${gridColumns}-${activeLibraryId ?? "none"}`}
          data={isLoadingNewContent ? [] : visibleBooks}
          numColumns={isGridView ? gridColumns : 1}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          style={{ flex: 1, backgroundColor: palette.background }}
          contentContainerStyle={{
            paddingHorizontal: isGridView ? GRID_PADDING_H - GRID_HALF_GAP : 0,
            paddingTop: 16,
            paddingBottom: 40,
          }}
          ItemSeparatorComponent={() => <View style={{ height: isGridView ? GRID_GAP : 0 }} />}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            isLoadingNewContent ? (
              <LibrarySkeletonContent
                viewMode={viewMode}
                cardWidth={cardWidth}
                gridColumns={gridColumns}
                gridGap={GRID_GAP}
                listPaddingH={LIST_PADDING_H}
              />
            ) : (
              <EmptyState title={error ? "读取失败" : "没有匹配的图书"} detail={error ?? "请调整搜索词，或确认书库中存在图书。"} />
            )
          }
          renderItem={({ item }) =>
            isGridView ? (
              <View style={{ paddingHorizontal: GRID_HALF_GAP }}>
                <BookCard
                  book={item}
                  downloadStatus={bookDownloadStatusById[item.id] ?? "notDownloaded"}
                  downloadProgress={bookDownloadProgressById[item.id]}
                  width={cardWidth}
                  isAnyMenuOpen={openMenuBookId !== null}
                  onPress={() => void handleBookPress(item)}
                  menuActions={buildBookMenuActions(item, bookDownloadStatusById[item.id] ?? "notDownloaded", bookFormatsById[item.id], selectedFormatById[item.id])}
                  onMenuAction={(actionId) => handleBookMenuAction(item, actionId)}
                  onMenuOpen={() => handleMenuOpen(item.id)}
                  onMenuClose={handleMenuClose}
                />
              </View>
            ) : (
              <BookRow
                book={item}
                downloadStatus={bookDownloadStatusById[item.id] ?? "notDownloaded"}
                downloadProgress={bookDownloadProgressById[item.id]}
                isAnyMenuOpen={openMenuBookId !== null}
                onPress={() => void handleBookPress(item)}
                menuActions={buildBookMenuActions(item, bookDownloadStatusById[item.id] ?? "notDownloaded", bookFormatsById[item.id], selectedFormatById[item.id])}
                onMenuAction={(actionId) => handleBookMenuAction(item, actionId)}
                onMenuOpen={() => handleMenuOpen(item.id)}
                  onMenuClose={handleMenuClose}
                horizontalPadding={LIST_PADDING_H}
              />
            )
          }
        />
      </Reanimated.View>
    </>
  );
}
