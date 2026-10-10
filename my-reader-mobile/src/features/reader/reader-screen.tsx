import { ReaderScreenSettings } from "./components/ReaderScreenSettings"
import { ReaderPublicationSurface } from "./components/ReaderPublicationSurface"
import {
  ReaderLoadState,
  ReaderLoadingSurface,
  DomReaderFallback,
} from "./components/ReaderLoadState"
import {
  readerChromeState,
  readerBookContext,
  readerSearchState,
  readingSessionLocation,
  supportsReaderAnnotations,
} from "./reader-screen-state"
import { useReaderTheme } from "./hooks/use-reader-theme"
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
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import {
  Alert,
  Animated as RNAnimated,
  StatusBar,
  StyleSheet,
} from "react-native"
import { FadeIn, FadeOut } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ErrorBoundary } from "@/src/components/error-boundary"
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
  ReaderTtsControls,
  ReaderTtsSettingsSheet,
  type ReaderTtsSettingsSheetRef,
} from "@/src/features/reader/components/reader/chrome"
import {
  ChromeState,
  chromeReducer,
} from "@/src/features/reader/components/reader/chrome/chrome-state"
import { type ReaderSettingsSheetRef } from "@/src/features/reader/components/reader/chrome/ReaderSettingsSheet"
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
  classifyReaderTtsError,
  resolveReaderTtsViewportRelation,
} from "@/src/features/reader/tts/reader-tts"
import { useReaderTtsSession } from "@/src/features/reader/tts/use-reader-tts-session"
import { bookLoadRequestKey } from "@/src/hooks/book-load-identity"
import { useBookLoader } from "@/src/hooks/use-book-loader"
import { useReaderProgressSaver } from "@/src/hooks/use-reader-progress-saver"
import { useAppStore } from "@/src/store/app-store"
import { errorMessage } from "@/src/i18n/error-message"
import { Animated, View } from "@/tw"

const READER_CONTENT_FADE_MS = 220
const CLOSE_ROUTE_BACK_LEAD_MS = 180
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
  const {
    ready: readerReady,
    locator: currentLocator,
    currentPage,
    totalPages,
  } = readerState ?? {}
  const [chromeState, dispatch] = useReducer(chromeReducer, ChromeState.Reading)
  const settings = useAppStore((s) => s.settings)

  const navigationSheetRef = useRef<BottomSheetModal>(null)
  const annotationsSheetRef = useRef<BottomSheetModal>(null)
  const annotationEditorSheetRef = useRef<ReaderAnnotationEditorSheetRef>(null)
  const searchSheetRef = useRef<BottomSheetModal>(null)
  const settingsSheetRef = useRef<ReaderSettingsSheetRef>(null)
  const ttsSettingsSheetRef = useRef<ReaderTtsSettingsSheetRef>(null)
  const [ttsPlayerExpanded, setTtsPlayerExpanded] = useState(false)
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
  const {
    activeLoadState,
    isReflowReady,
    fallbackLanguages,
    bookId: loadedBookId,
    format: loadedFormat,
    closeTransitionFormat,
  } = readerBookContext(loadState, activeLibraryId, id, formatParam)
  const readerLanguage = resolveReaderLanguage(
    publicationLanguages,
    fallbackLanguages,
  )
  const showTtsError = useCallback(
    (error: string) => {
      const presentation = classifyReaderTtsError(error)
      let message: string
      switch (presentation.kind) {
        case "noReadableContent":
          message = t("reader.tts.errors.noReadableContent")
          break
        case "noVoices":
          message = t("reader.tts.errors.noVoices")
          break
        case "unknown":
          message = t("reader.tts.errors.unknown")
          break
        case "providerUnavailable":
          message = t("reader.tts.errors.providerUnavailable")
          break
      }
      Alert.alert(t("reader.tts.states.error"), message, [
        { text: t("common.gotIt") },
      ])
    },
    [t],
  )
  const {
    state: ttsState,
    remote: ttsRemote,
    viewportDetached: ttsViewportDetached,
    viewportOriginLocator: ttsViewportOriginLocator,
    start: startTts,
    seek: seekTts,
    play: playTts,
    pause: pauseTts,
    previous: previousTts,
    next: nextTts,
    stop: stopTts,
    markViewportMoved: markTtsViewportMoved,
    returnToPlaybackPosition: returnToTtsPlaybackPosition,
    handleStateChange: handleTtsStateChange,
    handleSynthesisRequest: handleTtsSynthesisRequest,
    handleSynthesisCancel: handleTtsSynthesisCancel,
  } = useReaderTtsSession({
    enabled: Boolean(isReflowReady && readerReady),
    publicationKey,
    language: readerLanguage,
    highlightColor: palette.primary,
    readerRef: reflowReaderRef,
    onError: showTtsError,
  })
  const ttsViewportRelation = resolveReaderTtsViewportRelation({
    viewportDetached: ttsViewportDetached,
    viewportLocator: currentLocator,
    viewportOriginLocator: ttsViewportOriginLocator,
    playbackLocator: ttsState?.locator,
    positions,
  })
  const readerSearch = useReaderSearch(
    isReflowReady && readerReady ? publicationId : null,
  )
  const runReaderSearch = readerSearch.runSearch
  const resetReaderSearch = readerSearch.reset
  const { searchAvailable, activeSearchLocator } = readerSearchState(
    readerReady,
    readerSearch,
    searchDecoration,
    publicationKey,
  )
  const readingLocationKey = readingSessionLocation(currentLocator, currentPage)
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
    loadedBookId,
    loadedFormat,
    currentLocator,
    bookmarkLocationResolver,
  )
  const readerAnnotations = useReaderAnnotations(
    activeLibrary,
    loadedBookId,
    loadedFormat,
  )

  const handleStateChange = useCallback(
    async (state: ReaderState) => {
      setReaderRuntime((current) =>
        updateReaderRuntime(current, publicationKey, { readerState: state }),
      )
    },
    [publicationKey],
  )

  const handleUserLocationChange = useCallback(
    (
      locator: Locator,
      navigationId: string,
      navigationKind: "pageTurn" | "programmatic",
    ) => {
      setSearchDecoration(null)
      if (navigationKind === "programmatic") {
        if (
          ttsState?.state === "loading" ||
          ttsState?.state === "playing" ||
          ttsState?.state === "paused"
        ) {
          seekTts(locator, {
            navigationId,
            pauseAfterStart: ttsState.state === "paused",
            startAtViewportStart: true,
          })
        }
        return
      }
      markTtsViewportMoved(navigationId, currentLocator ?? ttsState?.locator)
    },
    [markTtsViewportMoved, currentLocator, seekTts, ttsState],
  )

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
    stopTts()
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
  }, [closeTransitionFormat, id, stopTts])

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

  const showAnnotationError = useCallback(
    (error: unknown) => {
      Alert.alert(t("reader.annotations.error"), errorMessage(error))
    },
    [t],
  )

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
      } catch (error) {
        showAnnotationError(error)
        return false
      }
    },
    [readerAnnotations, showAnnotationError],
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
      void mutation.catch(showAnnotationError)
    },
    [
      dismissSelectionMenu,
      readerAnnotations,
      selectionMenuState,
      showAnnotationError,
    ],
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
          id: "readAloud",
          label: t("reader.tts.readFromHere"),
        },
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
        case "readAloud": {
          dismissSelectionMenu()
          seekTts(event.locator)
          break
        }
        case "remove":
          handleSelectionRemove()
          break
      }
    },
    [
      dismissSelectionMenu,
      handleSelectionAddNote,
      handleSelectionColorSelect,
      handleSelectionRemove,
      seekTts,
    ],
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
      } catch (error) {
        showAnnotationError(error)
        return false
      }
    },
    [
      annotationEditorState,
      closeAnnotationEditor,
      readerAnnotations,
      showAnnotationError,
    ],
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
  const fontOptions = getReaderFontOptions(readerLanguage)
  const activeFontFamily = coerceReaderFontOption(
    resolveReaderFont(readerLanguage, reflowSettings),
    fontOptions,
  )
  const activeFontLanguageKey = readerFontLanguageKey(readerLanguage)

  const previewReaderPosition = useCallback(
    (positionIndex: number): ReaderProgressPreview => {
      const positionCount = Math.max(1, totalPages ?? 1)
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
    [getReaderPositions, isReflowReady, totalPages, t, toc],
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
  const handleExpandTts = useCallback(() => {
    setTtsPlayerExpanded(true)
  }, [])
  const handleOpenTtsSettings = useCallback(() => {
    ttsSettingsSheetRef.current?.present()
  }, [])
  const handleOpenReaderMore = useCallback(() => {
    dispatch({ type: "moreButtonTap" })
  }, [])
  const handleTtsConfigChange = useCallback(() => {
    if (
      ttsState?.state !== "loading" &&
      ttsState?.state !== "playing" &&
      ttsState?.state !== "paused"
    )
      return
    void startTts(ttsState.locator ?? currentLocator, {
      pauseAfterStart: ttsState.state === "paused",
    })
  }, [currentLocator, startTts, ttsState])
  const handlePlayTts = useCallback(() => {
    if (!ttsState) {
      void startTts(undefined, { startAtViewportStart: true })
      return
    }
    if (ttsState.state === "error" || ttsState.state === "ended") {
      void startTts(undefined, { startAtViewportStart: true })
      return
    }
    playTts()
  }, [playTts, startTts, ttsState])
  const handlePlayTtsFromCurrentPosition = useCallback(() => {
    const locator = currentLocator
    if (!locator) return
    seekTts(locator, {
      startAtViewportStart: true,
    })
  }, [currentLocator, seekTts])
  const handleReturnToTtsPlaybackPosition = useCallback(() => {
    void returnToTtsPlaybackPosition()
  }, [returnToTtsPlaybackPosition])
  const handleStopTts = useCallback(() => {
    setTtsPlayerExpanded(false)
    stopTts()
  }, [stopTts])
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
  const {
    fixedBgColor,
    themeBgColor,
    themeFgColor,
    statusBarStyle,
    themeBgStyle,
    themeOverlayStyle,
    chromePalette,
  } = useReaderTheme({
    formatParam,
    isReflowReady,
    loading: loadState.status === "loading",
    fixedSettings,
    reflowSettings,
    colorScheme,
  })
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
  const annotationsAvailable = supportsReaderAnnotations(
    isReflowReady,
    readerCapabilities,
  )
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
  if (loadState.status !== "ready" || !activeLoadState) {
    return (
      <ReaderLoadState
        loadState={loadState}
        resolveReadingPositionConflict={resolveReadingPositionConflict}
        statusBarStyle={statusBarStyle}
        themeBgColor={themeBgColor}
        themeFgColor={themeFgColor}
        handleBack={handleBack}
      />
    )
  }

  const isReflowSurface = loadState.layoutMode === "reflowable"
  const isFixedSurface = loadState.layoutMode === "fixedLayout"

  const {
    moreButtonVisible,
    bookmarkButtonVisible,
    bookmarkActionDisabled,
    ttsControlsExpanded,
    positionLabelVisible,
    ttsAvailable,
    ttsPlayerVisible,
    activeTocIndex,
    chapterLabelTitle,
    showChapterLabel,
  } = readerChromeState({
    chromeState,
    readerState,
    isReflowSurface,
    isFixedSurface,
    isCurrentLocationBookmarked,
    bookmarkPending,
    bookmarksLoading,
    bookmarkError: Boolean(bookmarkError),
    ttsPlayerExpanded,
    hasTtsState: Boolean(ttsState),
    toc,
  })

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
                <ReaderPublicationSurface
                  loadState={loadState}
                  reflowStyle={[
                    {
                      paddingTop: insets.top - 8,
                      paddingBottom: insets.bottom,
                      flex: 1,
                    },
                    themeBgStyle,
                  ]}
                  reflow={{
                    ref: reflowReaderRef,
                    onStateChange: handleStateChange,
                    onPositionsReady: handlePositionsReady,
                    onPublicationLanguagesReady:
                      handlePublicationLanguagesReady,
                    onPublicationReady: handlePublicationReady,
                    onPublicationLayoutReady: handlePublicationLayoutReady,
                    onCapabilitiesReady: handleCapabilitiesReady,
                    onTocReady: handleTocReady,
                    onUserLocationChange: handleUserLocationChange,
                    onRequestClose: handleRequestClose,
                    onToggleChrome: handleReaderTap,
                    theme: reflowSettings.theme,
                    fontFamily: activeFontFamily,
                    fontFamilyDeclarations: READER_FONT_DECLARATIONS,
                    fontSize: reflowSettings.fontSize,
                    lineHeight: reflowSettings.lineHeight,
                    paddingX: reflowSettings.paddingX,
                    textAlign: reflowSettings.textAlign,
                    columnCount: reflowSettings.columnCount,
                    language: readerLanguage,
                    decorations: readerDecorations,
                    selectionMenu: selectionMenu,
                    onSelectionAction: handleSelectionAction,
                    onSelectionChange: handleSelectionChange,
                    onDecorationActivated: handleDecorationActivated,
                    onTtsStateChange: handleTtsStateChange,
                    onTtsSynthesisRequest: handleTtsSynthesisRequest,
                    onTtsSynthesisCancel: handleTtsSynthesisCancel,
                    customSelectionMenu: true,
                  }}
                  fixed={{
                    ref: fixedReaderRef,
                    onStateChange: handleStateChange,
                    onPositionsReady: handlePositionsReady,
                    onTocReady: handleTocReady,
                    onRequestClose: handleRequestClose,
                    onToggleChrome: toggleChrome,
                    fallback: domFallback,
                    backgroundColor: fixedBgColor,
                    navigationMode: fixedSettings.navigationMode,
                    readingProgression: fixedSettings.readingProgression,
                    spread: fixedSettings.spread,
                  }}
                />

                <Animated.View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFill, themeOverlayStyle]}
                />

                {!readerReady && readerLoadingOverlay}
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
              currentPage={currentPage}
              totalPages={totalPages}
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

            {/* Fixed-layout fallback; text EPUB renders both bottom anchors together below. */}
            <ReaderMoreButton
              visible={moreButtonVisible}
              palette={chromePalette}
              onPress={handleOpenReaderMore}
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
              currentPositionIndex={currentPage ?? 0}
              positionCount={totalPages ?? 1}
              readingProgression={
                isFixedSurface ? fixedSettings.readingProgression : "ltr"
              }
              palette={chromePalette}
              showSearchAction={searchAvailable}
              showBookmarksAndNotesAction
              showTtsSettingsAction={ttsAvailable}
              onOpenToc={handleOpenToc}
              onOpenBookmarksAndNotes={handleOpenBookmarksAndNotes}
              onOpenSearch={handleOpenSearch}
              onOpenSettings={handleOpenSettings}
              onOpenTtsSettings={handleOpenTtsSettings}
              onPreviewPosition={previewReaderPosition}
              onCommitPosition={handleProgressCommit}
            />

            <ReaderTtsControls
              visible={ttsPlayerVisible}
              expanded={ttsControlsExpanded}
              state={ttsState}
              remote={ttsRemote}
              viewportRelation={ttsViewportRelation}
              palette={chromePalette}
              onExpand={handleExpandTts}
              onPlay={handlePlayTts}
              onPause={pauseTts}
              onPrevious={previousTts}
              onNext={nextTts}
              onStop={handleStopTts}
              onPlayFromCurrentPosition={handlePlayTtsFromCurrentPosition}
              onReturnToPlaybackPosition={handleReturnToTtsPlaybackPosition}
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
            <ReaderScreenSettings
              sheetRef={settingsSheetRef}
              chromePalette={chromePalette}
              onDismiss={handleSettingsDismiss}
              layoutMode={loadState.layoutMode}
              format={loadState.format}
              reflowSettings={reflowSettings}
              fixedSettings={fixedSettings}
              activeFontFamily={activeFontFamily}
              fontOptions={fontOptions}
              activeFontLanguageKey={activeFontLanguageKey}
            />

            <ReaderTtsSettingsSheet
              ref={ttsSettingsSheetRef}
              language={readerLanguage}
              palette={chromePalette}
              onConfigChange={handleTtsConfigChange}
            />
          </Animated.View>
        </RNAnimated.View>
      </BottomSheetModalProvider>
    </View>
  )
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
