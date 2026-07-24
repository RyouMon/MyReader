import {
  type BottomSheetModal,
  BottomSheetModalProvider,
} from "@expo/ui/community/bottom-sheet"
import type {
  DecorationActivatedEvent,
  DecorationGroup,
  Locator,
  ReaderCapabilities,
  Rect,
  SelectionActionEvent,
  SelectionEvent,
  SelectionMenuConfig,
} from "@my-reader/readium"
import {
  isReaderAnnotationColor,
  READER_ANNOTATION_COLORS,
  type ReaderAnnotationColor,
  readerAnnotationExcerpt,
  readerAnnotationMatchesSelection,
  sortReaderAnnotations,
} from "@my-reader/tools/reader-annotations"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { router, useLocalSearchParams } from "expo-router"
import {
  lazy,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  StatusBar,
  StyleSheet,
} from "react-native"
import {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ErrorBoundary } from "@/src/components/error-boundary"
import {
  type ReaderChromePalette,
  readerChromePalette,
} from "@/src/design/reader-chrome-palette"
import { READER_CHROME, READER_THEMES } from "@/src/design/reader-tokens"
import { useTheme } from "@/src/design/tokens"
import { useReadingSessionTracker } from "@/src/domain/reading-statistics/hooks/use-reading-session-tracker"
import {
  ReaderActionsExpanded,
  type ReaderAnnotationEditorDraft,
  ReaderAnnotationEditorSheet,
  type ReaderAnnotationEditorSheetRef,
  type ReaderAnnotationItem,
  ReaderBookmarkButton,
  type ReaderBookmarkItem,
  ReaderBookmarksAndNotesSheet,
  ReaderChapterLabel,
  ReaderCloseButton,
  ReaderMoreButton,
  ReaderNavigationSheet,
  ReaderPositionLabel,
  type ReaderProgressPreview,
  ReaderSearchSheet,
  readerBookmarkButtonVisible,
} from "@/src/features/reader/components/reader/chrome"
import {
  ChromeState,
  chromeReducer,
} from "@/src/features/reader/components/reader/chrome/chrome-state"
import ReaderSettingsSheet, {
  type ReaderSettingsSheetRef,
} from "@/src/features/reader/components/reader/chrome/ReaderSettingsSheet"
import { READER_THEME_OPTIONS } from "@/src/features/reader/components/reader/chrome/readerChromeConstants"
import type { FixedReaderSurfaceRef } from "@/src/features/reader/components/reader/fixed/FixedReaderSurface"
import { resolveReaderBookmarkNavigationLocator } from "@/src/features/reader/components/reader/reader-bookmark-navigation"
import {
  findLocatorForLinkHref,
  positionIndexForLocator,
  resolveReaderToc,
  resolveReaderTocAtPosition,
} from "@/src/features/reader/components/reader/reader-toc-resolver"
import type { ReadiumReflowReaderRef } from "@/src/features/reader/components/reader/reflow/ReadiumReflowReader"
import {
  coerceReaderFontOption,
  getReaderFontOptions,
  READER_FONT_DECLARATIONS,
  readerFontLanguageKey,
  resolveReaderFont,
  resolveReaderLanguage,
} from "@/src/features/reader/components/reader/reflow/reader-font-options"
import type {
  ReaderState,
  ReaderTocItem,
} from "@/src/features/reader/components/reader/types"
import { useReaderAnnotations } from "@/src/features/reader/hooks/use-reader-annotations"
import { useReaderBookmarks } from "@/src/features/reader/hooks/use-reader-bookmarks"
import { useReaderSearch } from "@/src/features/reader/hooks/use-reader-search"
import {
  createReaderAnnotationDecorationGroups,
  resolveReaderAnnotationActivation,
} from "@/src/features/reader/reader-annotation-decorations"
import type { ReaderAnnotation } from "@/src/features/reader/reader-annotations"
import {
  READER_BOOK_TRANSITION_MS,
  setReaderCloseTransition,
} from "@/src/features/reader/reader-open-transition"
import {
  bookLoadRequestKey,
  isReadyBookLoadForRequest,
} from "@/src/hooks/book-load-identity"
import { useBookLoader } from "@/src/hooks/use-book-loader"
import { useReaderProgressSaver } from "@/src/hooks/use-reader-progress-saver"
import { toNativeFilesystemPath } from "@/src/services/fs/path"
import { useAppStore } from "@/src/store/app-store"
import type { ReaderTheme } from "@/src/store/app-store.types"
import { Animated, Pressable, Text, View } from "@/tw"

const FixedReaderSurface = lazy(
  async () =>
    import("@/src/features/reader/components/reader/fixed/FixedReaderSurface"),
)
const ReadiumReflowReader = lazy(
  async () =>
    import(
      "@/src/features/reader/components/reader/reflow/ReadiumReflowReader"
    ),
)

const READER_CONTENT_FADE_MS = 220
const CLOSE_ROUTE_BACK_LEAD_MS = 180
const ERROR_BACK_BUTTON_BORDER_COLOR = READER_CHROME.border
const SELECTION_COLOR_ACTION_PREFIX = "color:"
const READER_ANNOTATION_COLOR_ORDER = [
  "yellow",
  "orange",
  "green",
  "blue",
] as const satisfies readonly ReaderAnnotationColor[]

type ReaderRuntime = {
  publicationKey: string
  publicationId: string | null
  readerState: ReaderState | null
  publicationLanguages: string[]
  positions: Locator[]
  toc: ReaderTocItem[]
  publicationLayout: string | null
  capabilities: ReaderCapabilities
}

type ReaderSelectionMenuState = {
  locator: Locator
  annotation: ReaderAnnotation | null
  rect?: Rect
}

function emptyReaderRuntime(publicationKey: string): ReaderRuntime {
  return {
    publicationKey,
    publicationId: null,
    readerState: null,
    publicationLanguages: [],
    positions: [],
    toc: [],
    publicationLayout: null,
    capabilities: {
      canSelectText: false,
      canDecorate: false,
      supportedDecorationStyles: [],
    },
  }
}

function updateReaderRuntime(
  current: ReaderRuntime,
  publicationKey: string,
  patch: Partial<Omit<ReaderRuntime, "publicationKey">>,
): ReaderRuntime {
  const active =
    current.publicationKey === publicationKey
      ? current
      : emptyReaderRuntime(publicationKey)
  return { ...active, ...patch }
}

export default function ReaderScreen() {
  const { t } = useTranslation()
  const { id, format: formatParam } = useLocalSearchParams<{
    id?: string
    format?: string
  }>()
  const activeLibraryId = useAppStore((s) => s.activeLibraryId)
  const publicationKey = bookLoadRequestKey(activeLibraryId, id, formatParam)
  const { palette, colorScheme } = useTheme()
  const insets = useSafeAreaInsets()
  const [readerRuntime, setReaderRuntime] = useState<ReaderRuntime>(() =>
    emptyReaderRuntime(publicationKey),
  )
  const activeReaderRuntime =
    readerRuntime.publicationKey === publicationKey
      ? readerRuntime
      : emptyReaderRuntime(publicationKey)
  const {
    publicationId,
    readerState,
    publicationLanguages,
    positions,
    toc,
    capabilities: readerCapabilities,
  } = activeReaderRuntime
  const [chromeState, dispatch] = useReducer(chromeReducer, ChromeState.Reading)
  const settings = useAppStore((s) => s.settings)
  const patchReflowableReaderSettings = useAppStore(
    (s) => s.patchReflowableReaderSettings,
  )
  const patchFixedReaderSettings = useAppStore(
    (s) => s.patchFixedReaderSettings,
  )

  const navigationSheetRef = useRef<BottomSheetModal>(null)
  const annotationsSheetRef = useRef<BottomSheetModal>(null)
  const annotationEditorSheetRef = useRef<ReaderAnnotationEditorSheetRef>(null)
  const searchSheetRef = useRef<BottomSheetModal>(null)
  const settingsSheetRef = useRef<ReaderSettingsSheetRef>(null)
  const reflowReaderRef = useRef<ReadiumReflowReaderRef>(null)
  const fixedReaderRef = useRef<FixedReaderSurfaceRef>(null)
  const [searchDecoration, setSearchDecoration] = useState<{
    publicationKey: string
    locator: ReaderLocator
  } | null>(null)
  const [annotationEditorState, setAnnotationEditorState] = useState<
    | { mode: "create"; locator: Locator; createdAt: number }
    | { mode: "edit"; annotation: ReaderAnnotation }
    | null
  >(null)
  const [selectionMenuState, setSelectionMenuState] =
    useState<ReaderSelectionMenuState | null>(null)
  const readerPositionsRef = useRef<{
    publicationKey: string
    positions: Locator[]
  }>({ publicationKey, positions: [] })
  const closeRouteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const activeLibrary = useAppStore(
    (s) =>
      s.libraries.find((library) => library.id === s.activeLibraryId) ?? null,
  )
  const { loadState, resolveReadingPositionConflict } = useBookLoader(
    id,
    formatParam,
    activeLibraryId,
  )
  const activeLoadState =
    loadState.status === "ready" &&
    isReadyBookLoadForRequest(loadState, activeLibraryId, id, formatParam)
      ? loadState
      : null
  const isReflowReady = activeLoadState?.layoutMode === "reflowable"
  const readerSearch = useReaderSearch(
    isReflowReady && readerState?.ready ? publicationId : null,
  )
  const runReaderSearch = readerSearch.runSearch
  const resetReaderSearch = readerSearch.reset
  const searchAvailable = Boolean(
    readerState?.ready && readerSearch.capabilities?.searchable,
  )
  const readingLocationKey = readerState?.locator
    ? JSON.stringify([
        readerState.locator.href,
        readerState.locator.locations ?? null,
      ])
    : (readerState?.currentPage ?? null)
  useReaderProgressSaver(activeLibraryId, activeLoadState, readerState)
  useReadingSessionTracker(
    activeLibrary,
    activeLoadState,
    readerState,
    readingLocationKey,
  )
  const captureCurrentBookmarkLocator = useCallback(
    () =>
      reflowReaderRef.current?.getBookmarkLocator() ?? Promise.resolve(null),
    [],
  )
  const isBookmarkLocatorVisible = useCallback(
    (locator: Locator) =>
      reflowReaderRef.current?.isBookmarkVisible(locator) ??
      Promise.resolve(false),
    [],
  )
  const bookmarkLocationResolver = useMemo(
    () =>
      isReflowReady
        ? {
            captureCurrentLocator: captureCurrentBookmarkLocator,
            isLocatorVisible: isBookmarkLocatorVisible,
            visibilityRevision: JSON.stringify(settings.reflowable),
          }
        : undefined,
    [
      captureCurrentBookmarkLocator,
      isBookmarkLocatorVisible,
      isReflowReady,
      settings.reflowable,
    ],
  )
  const {
    bookmarks,
    isCurrentLocationBookmarked,
    currentBookmarkLocatorKey,
    isLoading: bookmarksLoading,
    isPending: bookmarkPending,
    error: bookmarkError,
    retryBookmarks,
    toggleCurrentBookmark,
    removeBookmark,
  } = useReaderBookmarks(
    activeLibrary,
    activeLoadState?.bookId ?? null,
    activeLoadState?.format ?? null,
    readerState?.locator,
    bookmarkLocationResolver,
  )
  const readerAnnotations = useReaderAnnotations(
    activeLibrary,
    activeLoadState?.bookId ?? null,
    activeLoadState?.format ?? null,
  )
  const closeTransitionFormat = activeLoadState?.format ?? formatParam

  const handleStateChange = useCallback(
    async (state: ReaderState) => {
      setReaderRuntime((current) =>
        updateReaderRuntime(current, publicationKey, { readerState: state }),
      )
    },
    [publicationKey],
  )

  const handleUserLocationChange = useCallback(() => {
    setSearchDecoration(null)
  }, [])

  const handlePositionsReady = useCallback(
    (positions: Locator[]) => {
      readerPositionsRef.current = { publicationKey, positions }
      setReaderRuntime((current) =>
        updateReaderRuntime(current, publicationKey, { positions }),
      )
    },
    [publicationKey],
  )

  const handleTocReady = useCallback(
    async (items: ReaderTocItem[]) => {
      setReaderRuntime((current) =>
        updateReaderRuntime(current, publicationKey, { toc: items }),
      )
    },
    [publicationKey],
  )

  const handlePublicationLanguagesReady = useCallback(
    (languages: string[]) => {
      setReaderRuntime((current) =>
        updateReaderRuntime(current, publicationKey, {
          publicationLanguages: languages,
        }),
      )
    },
    [publicationKey],
  )

  const handlePublicationReady = useCallback(
    (nextPublicationId: string) => {
      setReaderRuntime((current) =>
        updateReaderRuntime(current, publicationKey, {
          publicationId: nextPublicationId,
        }),
      )
    },
    [publicationKey],
  )

  const handlePublicationLayoutReady = useCallback(
    (layout: string | null) => {
      setReaderRuntime((current) =>
        updateReaderRuntime(current, publicationKey, {
          publicationLayout: layout,
        }),
      )
    },
    [publicationKey],
  )

  const handleCapabilitiesReady = useCallback(
    (capabilities: ReaderCapabilities) => {
      setReaderRuntime((current) =>
        updateReaderRuntime(current, publicationKey, { capabilities }),
      )
    },
    [publicationKey],
  )

  const getReaderPositions = useCallback(() => {
    return readerPositionsRef.current.publicationKey === publicationKey
      ? readerPositionsRef.current.positions
      : []
  }, [publicationKey])

  const closeReader = useCallback(() => {
    if (router.canGoBack()) {
      if (closeRouteTimeoutRef.current) {
        return
      }
      const nextCloseTransition = id
        ? setReaderCloseTransition(id, () => router.back(), {
            format: closeTransitionFormat,
          })
        : null
      if (nextCloseTransition) {
        if (nextCloseTransition.nativeStarted) {
          closeRouteTimeoutRef.current = setTimeout(
            () => {
              closeRouteTimeoutRef.current = null
              router.back()
            },
            Math.max(0, READER_BOOK_TRANSITION_MS - CLOSE_ROUTE_BACK_LEAD_MS),
          )
        }
        return
      }
      router.back()
    }
  }, [closeTransitionFormat, id])

  useEffect(() => {
    return () => {
      if (closeRouteTimeoutRef.current) {
        clearTimeout(closeRouteTimeoutRef.current)
      }
    }
  }, [])

  const handleRequestClose = useCallback(async () => {
    closeReader()
  }, [closeReader])

  const handleBack = useCallback(() => {
    closeReader()
  }, [closeReader])

  const toggleChrome = useCallback(() => {
    dispatch({ type: "contentTap" })
  }, [])

  const navigateToLocator = useCallback(
    (locator: Locator, tocItem?: ReaderTocItem) => {
      if (isReflowReady) {
        reflowReaderRef.current?.goTo(locator, tocItem)
        return
      }
      fixedReaderRef.current?.goTo(locator)
    },
    [isReflowReady],
  )

  const handleTocSelect = useCallback(
    (item: ReaderTocItem) => {
      const targetLocator =
        item.locator ?? findLocatorForLinkHref(getReaderPositions(), item.href)
      if (targetLocator) navigateToLocator(targetLocator, item)
      navigationSheetRef.current?.dismiss()
      dispatch({ type: "navigationSelect" })
    },
    [getReaderPositions, navigateToLocator],
  )

  const handleNavigationDismiss = useCallback(() => {
    dispatch({ type: "navigationDismiss" })
  }, [])

  const handleAnnotationsDismiss = useCallback(() => {
    dispatch({ type: "annotationsDismiss" })
  }, [])

  const handleBookmarkSelect = useCallback(
    (item: ReaderBookmarkItem) => {
      navigateToLocator(
        resolveReaderBookmarkNavigationLocator(
          item.locator,
          positions,
          isReflowReady ? "reflowable" : "fixed",
        ),
      )
      annotationsSheetRef.current?.dismiss()
      dispatch({ type: "annotationSelect" })
    },
    [isReflowReady, navigateToLocator, positions],
  )

  const handleBookmarkDelete = useCallback(
    (item: ReaderBookmarkItem) => removeBookmark(item.locator),
    [removeBookmark],
  )

  const closeAnnotationEditor = useCallback(() => {
    annotationEditorSheetRef.current?.dismiss()
  }, [])

  const handleAnnotationEditorDismiss = useCallback(() => {
    setAnnotationEditorState(null)
  }, [])

  const dismissSelectionMenu = useCallback(() => {
    setSelectionMenuState(null)
    reflowReaderRef.current?.clearSelection()
  }, [])

  const handleReaderTap = useCallback(() => {
    dismissSelectionMenu()
    toggleChrome()
  }, [dismissSelectionMenu, toggleChrome])

  const handleSelectionChange = useCallback(
    (event: SelectionEvent) => {
      const locator = event.locator
      if (!locator || !readerAnnotationExcerpt(locator)) {
        setSelectionMenuState(null)
        return
      }
      const annotation =
        readerAnnotations.annotations.find((item) =>
          readerAnnotationMatchesSelection(item.locator, locator),
        ) ?? null
      setSelectionMenuState({ locator, annotation, rect: event.rect })
    },
    [readerAnnotations.annotations],
  )

  const handleDecorationActivated = useCallback(
    (event: DecorationActivatedEvent) => {
      const activation = resolveReaderAnnotationActivation(
        event,
        readerAnnotations.annotations,
      )
      if (!activation) return
      if (activation.target === "note") {
        setSelectionMenuState(null)
        setAnnotationEditorState({
          mode: "edit",
          annotation: activation.annotation,
        })
        return
      }
      setSelectionMenuState({
        locator: activation.annotation.locator,
        annotation: activation.annotation,
        rect: event.rect,
      })
    },
    [readerAnnotations.annotations],
  )

  const handleAnnotationSelect = useCallback(
    (item: ReaderAnnotationItem) => {
      navigateToLocator(item.locator)
      annotationsSheetRef.current?.dismiss()
      dispatch({ type: "annotationSelect" })
    },
    [navigateToLocator],
  )

  const handleAnnotationEdit = useCallback(
    (item: ReaderAnnotationItem) => {
      const annotation = readerAnnotations.annotations.find(
        (row) => row.id === item.id,
      )
      if (!annotation) return
      annotationsSheetRef.current?.dismiss()
      dispatch({ type: "annotationSelect" })
      setAnnotationEditorState({ mode: "edit", annotation })
    },
    [readerAnnotations.annotations],
  )

  const removeAnnotation = useCallback(
    async (annotation: ReaderAnnotation): Promise<boolean> => {
      try {
        await readerAnnotations.remove(annotation)
        return true
      } catch {
        Alert.alert(t("reader.annotations.error"))
        return false
      }
    },
    [readerAnnotations, t],
  )

  const handleSelectionColorSelect = useCallback(
    (color: ReaderAnnotationColor) => {
      const selection = selectionMenuState
      if (!selection) return
      dismissSelectionMenu()
      const mutation = selection.annotation
        ? selection.annotation.color === color
          ? Promise.resolve()
          : readerAnnotations.update(
              selection.annotation,
              color,
              selection.annotation.note,
            )
        : readerAnnotations.add(selection.locator, color)
      void mutation.catch(() => Alert.alert(t("reader.annotations.error")))
    },
    [dismissSelectionMenu, readerAnnotations, selectionMenuState, t],
  )

  const handleSelectionAddNote = useCallback(() => {
    const selection = selectionMenuState
    if (!selection) return
    dismissSelectionMenu()
    setAnnotationEditorState(
      selection.annotation
        ? { mode: "edit", annotation: selection.annotation }
        : {
            mode: "create",
            locator: selection.locator,
            createdAt: Date.now(),
          },
    )
  }, [dismissSelectionMenu, selectionMenuState])

  const handleSelectionRemove = useCallback(() => {
    const annotation = selectionMenuState?.annotation
    if (!annotation) return
    dismissSelectionMenu()
    void removeAnnotation(annotation)
  }, [dismissSelectionMenu, removeAnnotation, selectionMenuState])

  const selectionMenu = useMemo<SelectionMenuConfig | undefined>(() => {
    if (!selectionMenuState) return undefined

    return {
      locator: selectionMenuState.locator,
      selectedText: readerAnnotationExcerpt(selectionMenuState.locator),
      rect: selectionMenuState.rect,
      colorMenuLabel: t("reader.annotations.highlightAction"),
      colors: READER_ANNOTATION_COLOR_ORDER.map((color) => ({
        id: `${SELECTION_COLOR_ACTION_PREFIX}${color}`,
        label: t(`reader.annotations.colors.${color}`),
        color: READER_ANNOTATION_COLORS[color],
        selected: selectionMenuState.annotation?.color === color,
      })),
      actions: [
        {
          id: "addNote",
          label: t(
            selectionMenuState.annotation?.note?.trim()
              ? "reader.annotations.editNoteAction"
              : "reader.annotations.noteAction",
          ),
        },
        ...(selectionMenuState.annotation
          ? [
              {
                id: "remove",
                label: t("reader.annotations.removeAction"),
                destructive: true,
              },
            ]
          : []),
      ],
    }
  }, [selectionMenuState, t])

  const handleSelectionAction = useCallback(
    (event: SelectionActionEvent) => {
      if (event.actionId.startsWith(SELECTION_COLOR_ACTION_PREFIX)) {
        const color = event.actionId.slice(SELECTION_COLOR_ACTION_PREFIX.length)
        if (isReaderAnnotationColor(color)) handleSelectionColorSelect(color)
        return
      }

      switch (event.actionId) {
        case "addNote":
          handleSelectionAddNote()
          break
        case "remove":
          handleSelectionRemove()
          break
      }
    },
    [handleSelectionAddNote, handleSelectionColorSelect, handleSelectionRemove],
  )

  const handleAnnotationDelete = useCallback(
    (item: ReaderAnnotationItem) => {
      const annotation = readerAnnotations.annotations.find(
        (row) => row.id === item.id,
      )
      if (!annotation) return false
      return removeAnnotation(annotation)
    },
    [readerAnnotations.annotations, removeAnnotation],
  )

  const handleAnnotationEditorSave = useCallback(
    async (color: ReaderAnnotationColor, note: string): Promise<boolean> => {
      if (!annotationEditorState) return false
      try {
        if (annotationEditorState.mode === "create") {
          await readerAnnotations.add(
            annotationEditorState.locator,
            color,
            note,
          )
        } else {
          await readerAnnotations.update(
            annotationEditorState.annotation,
            color,
            note,
          )
        }
        closeAnnotationEditor()
        return true
      } catch {
        Alert.alert(t("reader.annotations.error"))
        return false
      }
    },
    [annotationEditorState, closeAnnotationEditor, readerAnnotations, t],
  )

  const handleAnnotationEditorDelete = useCallback(async () => {
    if (annotationEditorState?.mode !== "edit") return false
    const removed = await removeAnnotation(annotationEditorState.annotation)
    if (removed) closeAnnotationEditor()
    return removed
  }, [annotationEditorState, closeAnnotationEditor, removeAnnotation])

  const handleSettingsDismiss = useCallback(() => {
    dispatch({ type: "settingsDismiss" })
  }, [])

  const handleOpenSearch = useCallback(() => {
    if (searchAvailable) dispatch({ type: "searchPillTap" })
  }, [searchAvailable])

  const handleSearch = useCallback(
    (query: string) => {
      setSearchDecoration(null)
      void runReaderSearch(query)
    },
    [runReaderSearch],
  )

  const handleSearchResultSelect = useCallback(
    (locator: ReaderLocator) => {
      const nativeLocator: Locator = locator
      setSearchDecoration({ publicationKey, locator })
      navigateToLocator(nativeLocator)
      searchSheetRef.current?.dismiss()
      dispatch({ type: "searchSelect" })
    },
    [navigateToLocator, publicationKey],
  )

  const handleSearchDismiss = useCallback(() => {
    dispatch({ type: "searchDismiss" })
  }, [])

  const handleSearchClear = useCallback(() => {
    setSearchDecoration(null)
    resetReaderSearch()
  }, [resetReaderSearch])

  useEffect(() => {
    if (chromeState !== ChromeState.NavigationSheet) {
      navigationSheetRef.current?.dismiss()
      return
    }

    const frame = requestAnimationFrame(() =>
      navigationSheetRef.current?.present(),
    )
    return () => cancelAnimationFrame(frame)
  }, [chromeState])

  useEffect(() => {
    if (chromeState !== ChromeState.AnnotationsSheet) {
      annotationsSheetRef.current?.dismiss()
      return
    }

    const frame = requestAnimationFrame(() =>
      annotationsSheetRef.current?.present(),
    )
    return () => cancelAnimationFrame(frame)
  }, [chromeState])

  useEffect(() => {
    if (chromeState !== ChromeState.SettingsSheet) {
      settingsSheetRef.current?.dismiss()
      return
    }

    const frame = requestAnimationFrame(() =>
      settingsSheetRef.current?.present(),
    )
    return () => cancelAnimationFrame(frame)
  }, [chromeState])

  useEffect(() => {
    void publicationKey
    annotationEditorSheetRef.current?.dismiss()
    setAnnotationEditorState(null)
  }, [publicationKey])

  useEffect(() => {
    if (!annotationEditorState) return
    const frame = requestAnimationFrame(() =>
      annotationEditorSheetRef.current?.present(),
    )
    return () => cancelAnimationFrame(frame)
  }, [annotationEditorState])

  useEffect(() => {
    if (chromeState !== ChromeState.SearchSheet) {
      searchSheetRef.current?.dismiss()
      return
    }
    if (!searchAvailable) {
      handleSearchDismiss()
      return
    }

    const frame = requestAnimationFrame(() => searchSheetRef.current?.present())
    return () => cancelAnimationFrame(frame)
  }, [chromeState, handleSearchDismiss, searchAvailable])

  const reflowSettings = settings.reflowable
  const fixedSettings = settings.fixed
  const fallbackLanguages = activeLoadState?.languages ?? []
  const readerLanguage = resolveReaderLanguage(
    publicationLanguages,
    fallbackLanguages,
  )
  const fontOptions = getReaderFontOptions(readerLanguage)
  const activeFontFamily = coerceReaderFontOption(
    resolveReaderFont(readerLanguage, reflowSettings),
    fontOptions,
  )
  const activeFontLanguageKey = readerFontLanguageKey(readerLanguage)

  const previewReaderPosition = useCallback(
    (positionIndex: number): ReaderProgressPreview => {
      const positionCount = Math.max(1, readerState?.totalPages ?? 1)
      const targetPositionIndex = Math.max(
        0,
        Math.min(positionCount - 1, Math.round(positionIndex)),
      )
      const chapterTitle = resolveReaderTocAtPosition({
        toc,
        positions: getReaderPositions(),
        positionIndex: targetPositionIndex,
      }).title?.trim()

      return {
        chapterTitle: chapterTitle || undefined,
        positionLabel: isReflowReady
          ? t("reader.positionProgress", {
              current: targetPositionIndex + 1,
              total: positionCount,
            })
          : t("reader.pageProgress", {
              current: targetPositionIndex + 1,
              total: positionCount,
            }),
      }
    },
    [getReaderPositions, isReflowReady, readerState?.totalPages, t, toc],
  )

  const handleProgressCommit = useCallback(
    (positionIndex: number) => {
      const targetLocator = getReaderPositions()[positionIndex]
      if (targetLocator) navigateToLocator(targetLocator)
    },
    [getReaderPositions, navigateToLocator],
  )

  const handleOpenToc = useCallback(() => {
    dispatch({ type: "navigationPillTap" })
  }, [])

  const handleOpenBookmarksAndNotes = useCallback(() => {
    dispatch({ type: "annotationsPillTap" })
  }, [])

  const handleOpenSettings = useCallback(() => {
    dispatch({ type: "settingsPillTap" })
  }, [])
  const bookmarkItems = useMemo<ReaderBookmarkItem[]>(() => {
    return bookmarks.map((bookmark) => {
      const positionIndex = positionIndexForLocator(positions, bookmark.locator)
      const position = positionIndex + 1
      const chapterTitle =
        resolveReaderToc({
          toc,
          positions,
          locator: bookmark.locator,
        }).title?.trim() || bookmark.locator.title?.trim()
      const title = isReflowReady
        ? chapterTitle || t("reader.bookmarks.position", { position })
        : t("reader.bookmarks.page", { page: position })

      return {
        id: bookmark.id,
        locator: bookmark.locator,
        title,
        positionLabel: isReflowReady && chapterTitle ? String(position) : "",
        createdAt: bookmark.createdAt,
        active: bookmark.locatorKey === currentBookmarkLocatorKey,
      }
    })
  }, [bookmarks, currentBookmarkLocatorKey, isReflowReady, positions, t, toc])
  const annotationItems = useMemo<ReaderAnnotationItem[]>(
    () =>
      sortReaderAnnotations(readerAnnotations.annotations, positions).map(
        (annotation) => ({
          id: annotation.id,
          locator: annotation.locator,
          excerpt:
            readerAnnotationExcerpt(annotation.locator) ||
            t("reader.annotations.title"),
          note: annotation.note,
          color: annotation.color,
          createdAt: annotation.createdAt,
        }),
      ),
    [positions, readerAnnotations.annotations, t],
  )
  const annotationEditorDraft =
    useMemo<ReaderAnnotationEditorDraft | null>(() => {
      if (!annotationEditorState) return null
      const annotation =
        annotationEditorState.mode === "edit"
          ? annotationEditorState.annotation
          : null
      const locator =
        annotationEditorState.mode === "edit"
          ? annotationEditorState.annotation.locator
          : annotationEditorState.locator
      return {
        key:
          annotation?.id ?? `${locator.href}:${locator.text?.highlight ?? ""}`,
        excerpt:
          readerAnnotationExcerpt(locator) || t("reader.annotations.title"),
        color: annotation?.color ?? "yellow",
        note: annotation?.note ?? null,
        createdAt:
          annotation?.createdAt ??
          (annotationEditorState.mode === "create"
            ? annotationEditorState.createdAt
            : 0),
        existing: annotation !== null,
      }
    }, [annotationEditorState, t])
  const isReflowFormatHint = formatParam?.toUpperCase() === "EPUB"
  const shouldUseReflowTheme =
    isReflowReady || (loadState.status === "loading" && isReflowFormatHint)
  const fixedBgColor =
    fixedSettings.background === "black"
      ? "#000000"
      : fixedSettings.background === "white"
        ? "#FFFFFF"
        : colorScheme === "dark"
          ? "#000000"
          : "#FFFFFF"
  const activeTheme: ReaderTheme = shouldUseReflowTheme
    ? reflowSettings.theme
    : fixedBgColor === "#000000"
      ? "night"
      : "neutral"
  const themeBgColor = shouldUseReflowTheme
    ? (READER_THEMES[activeTheme] ?? READER_THEMES.neutral).bg
    : fixedBgColor
  const themeFgColor = shouldUseReflowTheme
    ? (READER_THEMES[activeTheme] ?? READER_THEMES.neutral).fg
    : fixedBgColor === "#000000"
      ? "#D4CBC3"
      : "#2C2420"
  const isDarkTheme = activeTheme === "night" || activeTheme === "contrast2"
  const statusBarStyle = isDarkTheme ? "light-content" : "dark-content"
  const themeBg = useSharedValue(themeBgColor)
  const themeOverlayOpacity = useSharedValue(0)
  const prevThemeBgRef = useRef(themeBgColor)
  useEffect(() => {
    if (prevThemeBgRef.current !== themeBgColor) {
      themeBg.value = prevThemeBgRef.current
      themeOverlayOpacity.value = 1
      themeOverlayOpacity.value = withTiming(0, { duration: 350 })
      themeBg.value = withTiming(themeBgColor, { duration: 350 })
      prevThemeBgRef.current = themeBgColor
    }
  }, [themeBgColor, themeBg, themeOverlayOpacity])
  const themeBgStyle = useAnimatedStyle(() => ({
    backgroundColor: themeBg.value,
  }))
  const themeOverlayStyle = useAnimatedStyle(() => ({
    backgroundColor: themeBg.value,
    opacity: themeOverlayOpacity.value,
  }))

  const chromePalette = useMemo<ReaderChromePalette>(() => {
    const option =
      READER_THEME_OPTIONS.find((o) => o.key === activeTheme) ??
      READER_THEME_OPTIONS[0]!
    return readerChromePalette(option.fg, option.swatch)
  }, [activeTheme])
  const activeSearchLocator =
    searchDecoration?.publicationKey === publicationKey &&
    readerSearch.locators.includes(searchDecoration.locator)
      ? searchDecoration.locator
      : null
  const readerDecorations = useMemo<DecorationGroup[]>(
    () => [
      {
        name: "search",
        decorations: activeSearchLocator
          ? [
              {
                id: "active-search-result",
                locator: activeSearchLocator,
                style: {
                  type: "highlight",
                  tint: chromePalette.accent,
                  isActive: false,
                },
              },
            ]
          : [],
      },
      ...createReaderAnnotationDecorationGroups(
        readerAnnotations.annotations,
        t("reader.annotations.openNote"),
      ),
    ],
    [
      activeSearchLocator,
      chromePalette.accent,
      readerAnnotations.annotations,
      t,
    ],
  )
  const annotationsAvailable =
    isReflowReady &&
    readerCapabilities.canSelectText &&
    readerCapabilities.canDecorate &&
    readerCapabilities.supportedDecorationStyles.includes("highlight")
  const domFallback = useMemo(
    () => (
      <DomReaderFallback
        backgroundColor={themeBgColor}
        foregroundColor={themeFgColor}
      />
    ),
    [themeBgColor, themeFgColor],
  )

  const readerLoadingOverlay = useMemo(
    () => (
      <Animated.View
        exiting={FadeOut.duration(READER_CONTENT_FADE_MS)}
        className="absolute inset-0 z-20"
        style={{ backgroundColor: themeBgColor }}
      >
        <ReaderLoadingSurface
          backgroundColor={themeBgColor}
          foregroundColor={themeFgColor}
        />
      </Animated.View>
    ),
    [themeBgColor, themeFgColor],
  )
  if (loadState.status === "position-conflict") {
    return (
      <View
        className="flex-1 justify-center px-5"
        style={{ backgroundColor: palette.background }}
      >
        <StatusBar hidden={false} barStyle={statusBarStyle} />
        <View
          className="rounded-2xl border p-5"
          style={{
            backgroundColor: palette.surface,
            borderColor: palette.border,
          }}
        >
          <Text
            className="text-lg font-semibold"
            style={{ color: palette.text }}
          >
            {t("reader.positionConflictTitle")}
          </Text>
          <Text className="mt-2 text-sm" style={{ color: palette.textMuted }}>
            {t("reader.positionConflictDescription")}
          </Text>
          <View className="mt-4 gap-2">
            {loadState.candidates.map((candidate) => {
              const progression = candidate.value.displayProgressionPpm
              return (
                <Pressable
                  key={candidate.operationId}
                  accessibilityRole="button"
                  className="rounded-xl border px-4 py-3"
                  style={{ borderColor: palette.border }}
                  onPress={() => {
                    void resolveReadingPositionConflict(candidate.operationId)
                  }}
                >
                  <Text
                    className="text-base font-medium"
                    style={{ color: palette.text }}
                  >
                    {progression === null
                      ? t("reader.positionConflictUnknownProgress")
                      : `${Math.round(progression / 10_000)}%`}
                  </Text>
                  <Text
                    className="mt-1 text-sm"
                    style={{ color: palette.textMuted }}
                  >
                    {new Date(candidate.value.recordedAt).toLocaleString()}
                    {" · "}
                    {candidate.value.replicaId.slice(0, 8)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            className="mt-3 items-center py-3"
            onPress={() => {
              void resolveReadingPositionConflict(null)
            }}
          >
            <Text
              className="text-sm font-medium"
              style={{ color: palette.textMuted }}
            >
              {t("reader.positionConflictLater")}
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }
  if (
    loadState.status === "loading" ||
    (loadState.status === "ready" && !activeLoadState)
  ) {
    return (
      <View className="flex-1" style={{ backgroundColor: themeBgColor }}>
        <StatusBar hidden={false} barStyle={statusBarStyle} />
        <ReaderLoadingSurface
          backgroundColor={themeBgColor}
          foregroundColor={themeFgColor}
        />
      </View>
    )
  }

  if (loadState.status === "error") {
    return (
      <View
        className="flex-1 w-full items-center justify-center px-7"
        style={{ backgroundColor: palette.background }}
      >
        <StatusBar
          hidden={false}
          barStyle={colorScheme === "dark" ? "light-content" : "dark-content"}
        />
        <View
          className="w-full max-w-[400px] items-center py-7 px-[22px] rounded-2xl border"
          style={{
            backgroundColor: READER_CHROME.errorCardBg,
            borderColor: READER_CHROME.errorCardBorder,
          }}
        >
          <Text
            className="text-center text-lg font-bold mb-3"
            style={{ color: READER_CHROME.textStrong }}
          >
            {t("reader.cannotOpen")}
          </Text>
          <Text
            className="text-center text-base"
            style={{ color: READER_CHROME.textSecondary }}
          >
            {loadState.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("reader.back")}
            className="mt-[22px] py-3 px-7 rounded-full border"
            style={{
              backgroundColor: READER_CHROME.surfaceIdle,
              borderColor: ERROR_BACK_BUTTON_BORDER_COLOR,
            }}
            onPress={handleBack}
          >
            <Text
              className="text-base font-semibold"
              style={{ color: READER_CHROME.textStrong }}
            >
              {t("reader.back")}
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const isReflowSurface = loadState.layoutMode === "reflowable"
  const isFixedSurface = loadState.layoutMode === "fixedLayout"
  // CBZ renders through Readium's FXL EPUB navigator, whose paginator is
  // horizontal-only and ignores `scroll` — so 上下翻页 can't apply to CBZ.
  const isCbzFixed = isFixedSurface && loadState.format.toUpperCase() === "CBZ"
  const chromeActive = chromeState >= ChromeState.Chrome
  const moreButtonVisible =
    chromeState === ChromeState.Chrome ||
    chromeState === ChromeState.NavigationSheet ||
    chromeState === ChromeState.AnnotationsSheet ||
    chromeState === ChromeState.SettingsSheet ||
    chromeState === ChromeState.SearchSheet
  const bookmarkButtonVisible = readerBookmarkButtonVisible(
    chromeState,
    isCurrentLocationBookmarked,
  )
  const bookmarkActionDisabled =
    bookmarkPending ||
    bookmarksLoading ||
    Boolean(bookmarkError) ||
    !readerState?.locator
  const positionLabelVisible =
    chromeActive &&
    readerState?.totalPages != null &&
    readerState.totalPages > 1
  const tocResolution = resolveReaderToc({
    toc,
    locator: readerState?.locator,
    currentPage: readerState?.currentPage,
    currentTitle: readerState?.chapterTitle,
  })
  const activeTocIndex = tocResolution.index
  const chapterLabelTitle =
    tocResolution.title?.trim() || readerState?.chapterTitle?.trim() || null
  const showChapterLabel =
    Boolean(chapterLabelTitle) &&
    chromeActive &&
    (isReflowSurface || isFixedSurface)

  return (
    <View style={styles.readerRouteFrame}>
      <BottomSheetModalProvider>
        <RNAnimated.View
          style={[styles.readerCloseFrame, { backgroundColor: themeBgColor }]}
        >
          <Animated.View
            testID="reader-screen"
            entering={FadeIn.duration(READER_CONTENT_FADE_MS)}
            className="flex-1"
            style={{ backgroundColor: themeBgColor }}
          >
            <StatusBar
              hidden={chromeState === ChromeState.Reading}
              barStyle={statusBarStyle}
              translucent={false}
            />

            <ErrorBoundary
              title={t("reader.loadFailed")}
              message={t("reader.loadFailedMessage")}
              onRetry={handleBack}
            >
              <View className="absolute inset-0">
                {isReflowSurface ? (
                  loadState.epubFileUri ? (
                    <Animated.View
                      style={[
                        {
                          paddingTop: insets.top - 8,
                          paddingBottom: insets.bottom,
                          flex: 1,
                        },
                        themeBgStyle,
                      ]}
                    >
                      <ReadiumReflowReader
                        ref={reflowReaderRef}
                        epubPath={toNativeFilesystemPath(loadState.epubFileUri)}
                        initialLocator={loadState.initialLocator ?? undefined}
                        onStateChange={handleStateChange}
                        onPositionsReady={handlePositionsReady}
                        onPublicationLanguagesReady={
                          handlePublicationLanguagesReady
                        }
                        onPublicationReady={handlePublicationReady}
                        onPublicationLayoutReady={handlePublicationLayoutReady}
                        onCapabilitiesReady={handleCapabilitiesReady}
                        onTocReady={handleTocReady}
                        onUserLocationChange={handleUserLocationChange}
                        onRequestClose={handleRequestClose}
                        onToggleChrome={handleReaderTap}
                        theme={reflowSettings.theme}
                        fontFamily={activeFontFamily}
                        fontFamilyDeclarations={READER_FONT_DECLARATIONS}
                        fontSize={reflowSettings.fontSize}
                        lineHeight={reflowSettings.lineHeight}
                        paddingX={reflowSettings.paddingX}
                        textAlign={reflowSettings.textAlign}
                        columnCount={reflowSettings.columnCount}
                        language={readerLanguage}
                        decorations={readerDecorations}
                        selectionMenu={selectionMenu}
                        customSelectionMenu
                        onSelectionAction={handleSelectionAction}
                        onSelectionChange={handleSelectionChange}
                        onDecorationActivated={handleDecorationActivated}
                      />
                    </Animated.View>
                  ) : null
                ) : isFixedSurface ? (
                  <FixedReaderSurface
                    ref={fixedReaderRef}
                    archiveUri={loadState.bookArchiveUri}
                    pdfLocalUri={loadState.pdfLocalUri}
                    format={loadState.format}
                    initialPage={loadState.initialPage}
                    initialLocator={loadState.initialLocator ?? undefined}
                    onStateChange={handleStateChange}
                    onPositionsReady={handlePositionsReady}
                    onTocReady={handleTocReady}
                    onRequestClose={handleRequestClose}
                    onToggleChrome={toggleChrome}
                    fallback={domFallback}
                    backgroundColor={fixedBgColor}
                    navigationMode={fixedSettings.navigationMode}
                    readingProgression={fixedSettings.readingProgression}
                    spread={fixedSettings.spread}
                  />
                ) : null}

                <Animated.View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFill, themeOverlayStyle]}
                />

                {loadState.status === "ready" &&
                  !readerState?.ready &&
                  readerLoadingOverlay}
              </View>
            </ErrorBoundary>

            {showChapterLabel ? (
              <ReaderChapterLabel
                insetsTop={insets.top}
                title={chapterLabelTitle}
                palette={chromePalette}
              />
            ) : null}

            <ReaderPositionLabel
              visible={positionLabelVisible}
              currentPage={readerState?.currentPage}
              totalPages={readerState?.totalPages}
              label={isReflowSurface ? t("reader.positionLabel") : undefined}
              palette={chromePalette}
            />

            {/* State 2+: Close button (top-right circle) */}
            <ReaderCloseButton
              insetsTop={insets.top}
              visible={chromeState >= ChromeState.Chrome}
              palette={chromePalette}
              onPress={handleRequestClose}
            />

            {/* State 2/4/5: More button (bottom-right circle); hidden when expanded (3) */}
            <ReaderMoreButton
              visible={moreButtonVisible}
              palette={chromePalette}
              onPress={() => dispatch({ type: "moreButtonTap" })}
            />

            {/* Standalone bookmark button (top-left). */}
            <ReaderBookmarkButton
              bookmarked={isCurrentLocationBookmarked}
              disabled={bookmarkActionDisabled}
              iconOnly={chromeState === ChromeState.Reading}
              insetsTop={insets.top}
              visible={bookmarkButtonVisible}
              palette={chromePalette}
              onPress={toggleCurrentBookmark}
            />

            {/* State 3: Expanded action pills */}
            <ReaderActionsExpanded
              insetsBottom={insets.bottom}
              visible={chromeState === ChromeState.Expanded}
              currentPositionIndex={readerState?.currentPage ?? 0}
              positionCount={readerState?.totalPages ?? 1}
              readingProgression={
                isFixedSurface ? fixedSettings.readingProgression : "ltr"
              }
              palette={chromePalette}
              showSearchAction={searchAvailable}
              showBookmarksAndNotesAction
              onOpenToc={handleOpenToc}
              onOpenBookmarksAndNotes={handleOpenBookmarksAndNotes}
              onOpenSearch={handleOpenSearch}
              onOpenSettings={handleOpenSettings}
              onPreviewPosition={previewReaderPosition}
              onCommitPosition={handleProgressCommit}
            />

            {/* State 4: table of contents sheet */}
            <ReaderNavigationSheet
              ref={navigationSheetRef}
              toc={toc}
              activeTocIndex={activeTocIndex}
              palette={chromePalette}
              onSelectTocItem={handleTocSelect}
              onDismiss={handleNavigationDismiss}
            />

            <ReaderBookmarksAndNotesSheet
              ref={annotationsSheetRef}
              annotations={annotationItems}
              annotationsAvailable={annotationsAvailable}
              annotationsError={Boolean(readerAnnotations.error)}
              annotationsLoading={readerAnnotations.loading}
              annotationsPending={readerAnnotations.mutating}
              bookmarks={bookmarkItems}
              bookmarksError={Boolean(bookmarkError)}
              bookmarksLoading={bookmarksLoading}
              bookmarksPending={bookmarkPending}
              palette={chromePalette}
              onRetryAnnotations={readerAnnotations.retry}
              onSelectAnnotation={handleAnnotationSelect}
              onEditAnnotation={handleAnnotationEdit}
              onDeleteAnnotation={handleAnnotationDelete}
              onRetryBookmarks={retryBookmarks}
              onSelectBookmark={handleBookmarkSelect}
              onDeleteBookmark={handleBookmarkDelete}
              onDismiss={handleAnnotationsDismiss}
            />

            <ReaderAnnotationEditorSheet
              ref={annotationEditorSheetRef}
              draft={annotationEditorDraft}
              pending={readerAnnotations.mutating}
              palette={chromePalette}
              onSave={handleAnnotationEditorSave}
              onDelete={
                annotationEditorState?.mode === "edit"
                  ? handleAnnotationEditorDelete
                  : undefined
              }
              onDismiss={handleAnnotationEditorDismiss}
            />

            <ReaderSearchSheet
              ref={searchSheetRef}
              status={readerSearch.status}
              query={readerSearch.query}
              locators={readerSearch.locators}
              toc={toc}
              positions={positions}
              resultCount={readerSearch.resultCount}
              done={readerSearch.done}
              hasMore={readerSearch.hasMore}
              loadingMore={readerSearch.loadingMore}
              loadMoreError={readerSearch.loadMoreError}
              selectedLocator={activeSearchLocator}
              palette={chromePalette}
              onSearch={handleSearch}
              onClear={handleSearchClear}
              onLoadMore={readerSearch.loadMore}
              onSelectResult={handleSearchResultSelect}
              onDismiss={handleSearchDismiss}
            />

            {/* State 5: Settings bottom sheet */}
            <ReaderSettingsSheet
              ref={settingsSheetRef}
              palette={chromePalette}
              onDismiss={handleSettingsDismiss}
              layout={isReflowSurface ? "reflowable" : "fixed"}
              reflow={
                isReflowSurface
                  ? {
                      theme: reflowSettings.theme,
                      onThemeChange: (key) =>
                        patchReflowableReaderSettings({ theme: key }),
                      fontFamily: activeFontFamily,
                      fontOptions,
                      onFontFamilyChange: (v) =>
                        patchReflowableReaderSettings({
                          fontFamiliesByLanguage: {
                            ...reflowSettings.fontFamiliesByLanguage,
                            [activeFontLanguageKey]: v,
                          },
                        }),
                      fontSize: reflowSettings.fontSize,
                      onFontSizeChange: (v) =>
                        patchReflowableReaderSettings({ fontSize: v }),
                      fontSizeMin: 14,
                      fontSizeMax: 28,
                      lineHeight: reflowSettings.lineHeight,
                      onLineHeightChange: (v) =>
                        patchReflowableReaderSettings({ lineHeight: v }),
                      lineHeightMin: 1.4,
                      lineHeightMax: 2.4,
                      margin: reflowSettings.paddingX,
                      onMarginChange: (v) =>
                        patchReflowableReaderSettings({ paddingX: v }),
                      marginMin: 12,
                      marginMax: 36,
                      textAlign: reflowSettings.textAlign,
                      onTextAlignChange: (v) =>
                        patchReflowableReaderSettings({ textAlign: v }),
                      columnCount: reflowSettings.columnCount,
                      onColumnCountChange: (v) =>
                        patchReflowableReaderSettings({ columnCount: v }),
                    }
                  : undefined
              }
              fixed={
                !isReflowSurface
                  ? {
                      background: fixedSettings.background,
                      onBackgroundChange: (v) =>
                        patchFixedReaderSettings({ background: v }),
                      navigationMode: fixedSettings.navigationMode,
                      onNavigationModeChange: (v) =>
                        patchFixedReaderSettings({ navigationMode: v }),
                      showPageDirection: !isCbzFixed,
                      readingProgression: fixedSettings.readingProgression,
                      onReadingProgressionChange: (v) =>
                        patchFixedReaderSettings({ readingProgression: v }),
                      spread: fixedSettings.spread,
                      onSpreadChange: (v) =>
                        patchFixedReaderSettings({ spread: v }),
                    }
                  : undefined
              }
            />
          </Animated.View>
        </RNAnimated.View>
      </BottomSheetModalProvider>
    </View>
  )
}

const DomReaderFallback = memo(function DomReaderFallback({
  backgroundColor,
  foregroundColor,
}: {
  backgroundColor: string
  foregroundColor: string
}) {
  return (
    <ReaderLoadingSurface
      backgroundColor={backgroundColor}
      foregroundColor={foregroundColor}
    />
  )
})

const ReaderLoadingSurface = memo(function ReaderLoadingSurface({
  backgroundColor,
  foregroundColor,
}: {
  backgroundColor: string
  foregroundColor: string
}) {
  const mutedColor = alphaColor(foregroundColor, 0.34)

  return (
    <View className="flex-1" style={{ backgroundColor }}>
      <View className="absolute inset-0 items-center justify-center px-10">
        <ActivityIndicator size="small" color={mutedColor} />
      </View>
    </View>
  )
})

function alphaColor(hex: string, alpha: number) {
  const value = hex.replace("#", "")
  if (value.length !== 6) return `rgba(244,238,230,${alpha})`
  const rgb = Number.parseInt(value, 16)
  if (!Number.isFinite(rgb)) return `rgba(244,238,230,${alpha})`
  return `rgba(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255},${alpha})`
}

const styles = StyleSheet.create({
  readerRouteFrame: {
    flex: 1,
    backgroundColor: "transparent",
  },
  readerCloseFrame: {
    flex: 1,
    overflow: "visible",
  },
})
