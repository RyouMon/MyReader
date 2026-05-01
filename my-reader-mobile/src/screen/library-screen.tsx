import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MenuView, type MenuComponentRef } from "@react-native-menu/menu";
import { FlashList } from "@shopify/flash-list";
import { Stack, router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Platform, TouchableNativeFeedback, View, useWindowDimensions } from "react-native";

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
import {
  getFormatFromPath,
  getReadableFormats,
  pathBelongsToBook,
  resolveEffectiveFormat,
} from "../data/book-formats";
import { getAllBookFormats, getBookFormatPaths } from "../data/calibre";
import type { BookItem } from "../data/types";
import { describeDownloadError } from "../errors";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { notifyLibraryRefresh } from "../notifications/download-notifications";
import { useAppStore } from "../store/app-store";
import type { LibraryViewMode } from "../store/app-store.types";
import { useLibraryStore } from "../store/library-store";
import {
  dismissTasksForPath,
  enqueue as enqueueDownload,
  useDownloadStatusTasks,
  type DownloadStatusTask,
} from "../sync/download-store";
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
type BookFileStateBundle = { statuses: BookFileStateMap; rows: BookFileStateRowMap };
type BookFormatMeta = { readableFormats: string[]; effectiveFormat?: string };

const defaultSortOption: SortOption = "最近添加";
const downloadedStates = new Set<LocalState>(["present", "local_only", "dirty_push"]);
const GRID_MIN_CARD_WIDTH = 150;
const GRID_MIN_COLUMNS = 2;
const GRID_MAX_COLUMNS = 6;
const EMPTY_FILE_STATE_BUNDLE: BookFileStateBundle = { statuses: {}, rows: {} };

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

/** Resolves the target format for a download action from a menu action id. */
function resolveDownloadTargetFormat(actionId: string): string | undefined {
  if (actionId === "download") return undefined;
  if (actionId.startsWith("download:")) {
    return actionId.slice("download:".length).toUpperCase();
  }
  return undefined;
}

const GRID_GAP_PX = 12;
const SeparatorGrid = () => <View style={{ height: GRID_GAP_PX }} />;
const SeparatorList = () => null;

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
  const [fileStateBundle, setFileStateBundle] = useState<BookFileStateBundle>(EMPTY_FILE_STATE_BUNDLE);
  const [selectedFormatById, setSelectedFormatById] = useState<Record<string, string>>({});
  const [bookFormatsById, setBookFormatsById] = useState<Record<string, string[]>>({});
  const fileStateRevision = useFileStateRevision();
  const statusTasks = useDownloadStatusTasks();
  const viewMode = useAppStore((state) => state.libraryViewMode);
  const setViewMode = useAppStore((state) => state.setLibraryViewMode);
  const debouncedQuery = useDebouncedValue(query, 180);
  const isGridView = viewMode === "grid";
  const syncActions = useSyncActions();
  const [openMenuBookId, setOpenMenuBookId] = useState<string | null>(null);
  const menuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRefreshingIdRef = useRef<string | null>(null);
  const isNavigatingRef = useRef(false);

  const isLoadingNewContent = loadingBooks && !refreshingLibraryId;

  const handleMenuOpen = useCallback((bookId: string) => {
    if (menuCloseTimerRef.current) {
      clearTimeout(menuCloseTimerRef.current);
      menuCloseTimerRef.current = null;
    }
    setOpenMenuBookId(bookId);
  }, []);

  const handleMenuClose = useCallback(() => {
    menuCloseTimerRef.current = setTimeout(() => {
      setOpenMenuBookId(null);
      menuCloseTimerRef.current = null;
    }, 120);
  }, []);

  const effectiveLibraryId = libraryIdProp ?? activeLibraryId ?? undefined;

  /** Switches active library only when user selects a different one. */
  const applyLibrarySelection = useCallback(
    (nextLibraryId: string) => {
      if (nextLibraryId === effectiveLibraryId) return;
      void switchLibrary(nextLibraryId);
    },
    [effectiveLibraryId, switchLibrary],
  );

  const selectedLibrary = useMemo(
    () => (effectiveLibraryId ? libraries.find((library) => library.id === effectiveLibraryId) ?? null : null),
    [libraries, effectiveLibraryId]
  );

  /** Opens a platform-neutral library picker menu without navigation. */
  const openLibrarySwitchMenu = useCallback(() => {
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
  }, [applyLibrarySelection, effectiveLibraryId, libraries, selectedLibrary]);

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
      setDownloadFilter(event.slice("filter:".length) as DownloadFilterOption);
      return;
    }
    if (event.startsWith("sort:")) {
      setSortBy(event.slice("sort:".length) as SortOption);
      return;
    }
    if (event.startsWith("view:")) {
      setViewMode(event.slice("view:".length) as LibraryViewMode);
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
      setFileStateBundle(EMPTY_FILE_STATE_BUNDLE);
      return;
    }

    if (selectedLibrary.sourceType !== "webdav" || !selectedLibrary.dataSourceId) {
      const statuses: BookFileStateMap = {};
      for (const book of books) statuses[book.id] = "downloaded";
      setFileStateBundle({ statuses, rows: {} });
      return;
    }

    let cancelled = false;
    void listFileStates({
      dataSourceId: selectedLibrary.dataSourceId,
      libraryId: selectedLibrary.id,
    }).then((rows) => {
      if (cancelled) return;
      const statuses: BookFileStateMap = {};
      const rowsByBook: BookFileStateRowMap = {};
      for (const book of books) {
        const matchedRows = rows.filter((row) => pathBelongsToBook(row.path, book.path));
        rowsByBook[book.id] = matchedRows;
        statuses[book.id] = matchedRows.some((row) => downloadedStates.has(row.localState))
          ? "downloaded"
          : "notDownloaded";
      }
      setFileStateBundle({ statuses, rows: rowsByBook });
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

  const isWebdav = selectedLibrary?.sourceType === "webdav";
  const selectedLibraryId = selectedLibrary?.id;

  /**
   * One-shot per-book format index. Drives both menu construction and download
   * status resolution without rebuilding inner arrays per book on every render.
   */
  const bookFormatMetaById = useMemo(() => {
    const map = new Map<string, BookFormatMeta>();
    for (const book of books) {
      const readableFormats = getReadableFormats(bookFormatsById[book.id]);
      const effectiveFormat = resolveEffectiveFormat(readableFormats, selectedFormatById[book.id]);
      map.set(book.id, { readableFormats, effectiveFormat });
    }
    return map;
  }, [books, bookFormatsById, selectedFormatById]);

  /**
   * Reverse index of in-flight tasks by bookId, computed once per status change
   * (NOT per progress tick — `useDownloadStatusTasks` ignores progress-only updates).
   * Removes the per-book O(N) `books.find()` from the status pipeline.
   */
  const tasksByBookId = useMemo(() => {
    const map = new Map<string, DownloadStatusTask[]>();
    if (!selectedLibraryId) return map;

    let needPathLookup = false;
    for (const task of statusTasks) {
      if (task.libraryId !== selectedLibraryId) continue;
      if (task.status !== "queued" && task.status !== "starting" && task.status !== "downloading" && task.status !== "done") continue;
      if (!task.bookId) {
        needPathLookup = true;
        continue;
      }
      const existing = map.get(task.bookId);
      if (existing) existing.push(task);
      else map.set(task.bookId, [task]);
    }

    if (needPathLookup) {
      for (const task of statusTasks) {
        if (task.bookId) continue;
        if (task.libraryId !== selectedLibraryId) continue;
        if (task.status !== "queued" && task.status !== "starting" && task.status !== "downloading" && task.status !== "done") continue;
        const book = books.find((candidate) => pathBelongsToBook(task.relativePath, candidate.path));
        if (!book) continue;
        const existing = map.get(book.id);
        if (existing) existing.push(task);
        else map.set(book.id, [task]);
      }
    }

    return map;
  }, [statusTasks, books, selectedLibraryId]);

  const bookDownloadStatusById = useMemo(() => {
    const next: BookFileStateMap = {};
    const { statuses, rows } = fileStateBundle;

    for (const book of books) {
      if (!isWebdav) {
        next[book.id] = statuses[book.id] ?? "downloaded";
        continue;
      }
      const meta = bookFormatMetaById.get(book.id);
      const effectiveFormat = meta?.effectiveFormat;
      const bookRows = rows[book.id] ?? [];
      const isDownloadedByEffectiveFormat = effectiveFormat
        ? bookRows.some(
            (row) =>
              downloadedStates.has(row.localState) && getFormatFromPath(row.path) === effectiveFormat,
          )
        : false;
      next[book.id] = isDownloadedByEffectiveFormat ? "downloaded" : "notDownloaded";
    }

    for (const [bookId, tasks] of tasksByBookId) {
      const meta = bookFormatMetaById.get(bookId);
      const effectiveFormat = meta?.effectiveFormat;
      if (!effectiveFormat) continue;
      for (const task of tasks) {
        const taskFormat = task.format?.toUpperCase() ?? getFormatFromPath(task.relativePath);
        if (taskFormat !== effectiveFormat) continue;
        if (task.status === "done") {
          next[bookId] = "downloaded";
        } else if (next[bookId] !== "downloaded") {
          next[bookId] = "downloading";
        }
      }
    }

    return next;
  }, [bookFormatMetaById, books, fileStateBundle, isWebdav, tasksByBookId]);

  /**
   * Search + sort step does NOT depend on download status, so progress changes
   * never trigger a resort. Filtering by download state is a separate, cheap pass.
   */
  const sortedSearchedBooks = useMemo(() => {
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

    return [...searchedBooks].sort((left, right) => {
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
  }, [books, debouncedQuery, sortBy]);

  const visibleBooks = useMemo(() => {
    if (downloadFilter === "all") return sortedSearchedBooks;
    return sortedSearchedBooks.filter(
      (book) => (bookDownloadStatusById[book.id] ?? "notDownloaded") === downloadFilter,
    );
  }, [bookDownloadStatusById, downloadFilter, sortedSearchedBooks]);

  /**
   * Snapshot of every value that menu/press handlers need. Updated each render
   * so handlers (which keep an empty dependency list) can read the latest
   * state without rebuilding their identity, keeping React.memo on cells valid.
   */
  const handlersStateRef = useRef({
    books,
    bookDownloadStatusById,
    bookFormatMetaById,
    fileStateBundle,
    openMenuBookId,
    selectedFormatById,
    selectedLibrary,
    syncActions,
  });
  handlersStateRef.current = {
    books,
    bookDownloadStatusById,
    bookFormatMetaById,
    fileStateBundle,
    openMenuBookId,
    selectedFormatById,
    selectedLibrary,
    syncActions,
  };

  /** Enqueues a download task for the selected book format. */
  async function downloadBook(book: BookItem, targetFormat?: string) {
    const { selectedLibrary: lib, selectedFormatById: formatById } = handlersStateRef.current;
    const calibreId = Number(book.id);
    if (!Number.isFinite(calibreId) || calibreId <= 0 || !lib || lib.sourceType !== "webdav") return;

    try {
      const paths = await getBookFormatPaths(lib, calibreId);
      const readableFormats = getReadableFormats(paths.map((path) => path.format));
      const normalizedTarget = targetFormat?.toUpperCase();
      const format = normalizedTarget
        ? readableFormats.find((item) => item === normalizedTarget)
        : resolveEffectiveFormat(readableFormats, formatById[book.id]);
      if (!format) {
        showAlertWithStatusBarRestore("无法下载", "该书没有可下载的可读格式");
        return;
      }
      const match = paths.find((p) => p.format.toUpperCase() === format);
      if (!match) return;

      await enqueueDownload({
        libraryId: lib.id,
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

  async function promptSetDefaultFormat(book: BookItem) {
    const { selectedLibrary: lib, selectedFormatById: formatById } = handlersStateRef.current;
    const calibreId = Number(book.id);
    if (!Number.isFinite(calibreId) || calibreId <= 0 || !lib) return;

    try {
      const paths = await getBookFormatPaths(lib, calibreId);
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

      const current = formatById[book.id];
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

  const handleBookPress = useCallback((bookId: string) => {
    if (isNavigatingRef.current) return;
    const latest = handlersStateRef.current;
    if (latest.openMenuBookId) return;
    const book = latest.books.find((b) => b.id === bookId);
    if (!book) return;
    const status = latest.bookDownloadStatusById[bookId] ?? "notDownloaded";

    if (latest.selectedLibrary?.sourceType !== "webdav" || status === "downloaded") {
      isNavigatingRef.current = true;
      const effectiveFormat = latest.bookFormatMetaById.get(bookId)?.effectiveFormat;
      if (effectiveFormat) {
        router.push({ pathname: "/reader/[id]", params: { id: bookId, format: effectiveFormat } });
      } else {
        router.push({ pathname: "/reader/[id]", params: { id: bookId } });
      }
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 1200);
      return;
    }

    void downloadBook(book);
  }, []);

  const handleBookMenuAction = useCallback((bookId: string, actionId: string) => {
    const latest = handlersStateRef.current;
    const book = latest.books.find((b) => b.id === bookId);
    if (!book) return;

    if (actionId === "download" || actionId.startsWith("download:")) {
      const targetFormat = resolveDownloadTargetFormat(actionId);
      void downloadBook(book, targetFormat);
      return;
    }
    if (actionId === "detail") {
      router.push({ pathname: "/library-book/[id]", params: { id: bookId } });
      return;
    }
    if (actionId.startsWith("setDefaultFormat:")) {
      const format = actionId.slice("setDefaultFormat:".length);
      if (format === "auto") {
        setSelectedFormatById((prev) => {
          const next = { ...prev };
          delete next[bookId];
          return next;
        });
      } else {
        setSelectedFormatById((prev) => ({ ...prev, [bookId]: format }));
      }
      return;
    }
    if (actionId === "setDefaultFormat") {
      void promptSetDefaultFormat(book);
      return;
    }
    if (actionId === "deleteDownload") {
      const rows = latest.fileStateBundle.rows[bookId] ?? [];
      const downloadedRows = rows.filter((row) => downloadedStates.has(row.localState));
      if (downloadedRows.length === 0) return;
      const lib = latest.selectedLibrary;
      const sync = latest.syncActions;
      if (!lib) return;
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
                    await sync.evictLocal(lib.id, row.path);
                    dismissTasksForPath(lib.id, row.path);
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
  }, []);

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

  const isMenuOpen = openMenuBookId !== null;

  const renderItem = useCallback(
    ({ item }: { item: BookItem }) => {
      const status = bookDownloadStatusById[item.id] ?? "notDownloaded";
      const effectiveFormat = bookFormatMetaById.get(item.id)?.effectiveFormat;
      const subscriptionLibraryId = isWebdav && status === "downloading" ? selectedLibraryId : undefined;
      const subscriptionFormat = subscriptionLibraryId ? effectiveFormat : undefined;
      const menuFormats = bookFormatsById[item.id];
      const menuSelectedFormat = selectedFormatById[item.id];

      if (isGridView) {
        return (
          <View style={{ paddingHorizontal: GRID_HALF_GAP }}>
            <BookCard
              book={item}
              downloadStatus={status}
              width={cardWidth}
              isAnyMenuOpen={isMenuOpen}
              onPress={handleBookPress}
              menuIsWebdav={isWebdav}
              menuFormats={menuFormats}
              menuSelectedFormat={menuSelectedFormat}
              onMenuAction={handleBookMenuAction}
              onMenuOpen={handleMenuOpen}
              onMenuClose={handleMenuClose}
              subscriptionLibraryId={subscriptionLibraryId}
              subscriptionFormat={subscriptionFormat}
            />
          </View>
        );
      }

      return (
        <BookRow
          book={item}
          downloadStatus={status}
          isAnyMenuOpen={isMenuOpen}
          onPress={handleBookPress}
          menuIsWebdav={isWebdav}
          menuFormats={menuFormats}
          menuSelectedFormat={menuSelectedFormat}
          onMenuAction={handleBookMenuAction}
          onMenuOpen={handleMenuOpen}
          onMenuClose={handleMenuClose}
          horizontalPadding={LIST_PADDING_H}
          subscriptionLibraryId={subscriptionLibraryId}
          subscriptionFormat={subscriptionFormat}
        />
      );
    },
    [
      GRID_HALF_GAP,
      LIST_PADDING_H,
      bookDownloadStatusById,
      bookFormatMetaById,
      bookFormatsById,
      cardWidth,
      handleBookMenuAction,
      handleBookPress,
      handleMenuClose,
      handleMenuOpen,
      isGridView,
      isMenuOpen,
      isWebdav,
      selectedFormatById,
      selectedLibraryId,
    ],
  );

  const getItemType = useCallback(() => (isGridView ? "grid" : "list"), [isGridView]);

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
          <EmptyState title="正在加载书库" detail="正在读取本地与 WebDAV 书库配置。" icon={{ ios: "hourglass", android: "hourglass-empty" }} />
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
          <EmptyState title="没有找到这个书库" detail="它可能已被移除，或链接参数已经失效。" icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
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
            icon={{ ios: "books.vertical.fill", android: "library-books" }}
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
          <EmptyState title="正在加载书库" detail="正在读取本地与 WebDAV 书库配置。" icon={{ ios: "hourglass", android: "hourglass-empty" }} />
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
            icon={{ ios: "list.bullet.rectangle", android: "list" }}
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
                  onPress={() => setDownloadFilter(option.value)}
                >
                  {option.label}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
            <Stack.Toolbar.Menu inline title="排序">
              {sortOptions.map((option) => (
                <Stack.Toolbar.MenuAction key={`sort-${option}`} isOn={sortBy === option} onPress={() => setSortBy(option)}>
                  {option}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
            <Stack.Toolbar.Menu inline title="视图">
              {viewOptions.map((option) => (
                <Stack.Toolbar.MenuAction
                  key={`view-${option.value}`}
                  isOn={viewMode === option.value}
                  onPress={() => setViewMode(option.value)}
                >
                  {option.label}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : null}
      <FlashList
        key={`${viewMode}-${gridColumns}-${activeLibraryId ?? "none"}`}
        data={isLoadingNewContent ? [] : visibleBooks}
        numColumns={isGridView ? gridColumns : 1}
        keyExtractor={(item) => item.id}
        getItemType={getItemType}
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: palette.background }}
        contentContainerStyle={{
          paddingHorizontal: isGridView ? GRID_PADDING_H - GRID_HALF_GAP : 0,
          paddingTop: 16,
          paddingBottom: 40,
        }}
        ItemSeparatorComponent={isGridView ? SeparatorGrid : SeparatorList}
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
          ) : error ? (
            <EmptyState title="读取失败" detail={error} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
          ) : (
            <EmptyState title="没有匹配的图书" detail="请调整搜索词，或确认书库中存在图书。" icon={{ ios: "magnifyingglass", android: "search" }} />
          )
        }
        renderItem={renderItem}
      />
    </>
  );
}
