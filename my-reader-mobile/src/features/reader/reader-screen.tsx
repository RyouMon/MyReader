import {
  type BottomSheetModal,
  BottomSheetModalProvider,
} from "@expo/ui/community/bottom-sheet"
import type { Locator } from "@my-reader/readium"
import { sameReaderBookmarkLocation } from "@my-reader/tools/reader-bookmarks"
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
import {
  ReaderActionsExpanded,
  ReaderBookmarkButton,
  readerBookmarkButtonVisible,
  type ReaderBookmarkItem,
  ReaderChapterLabel,
  ReaderCloseButton,
  ReaderMoreButton,
  ReaderNavigationSheet,
  ReaderPositionLabel,
  type ReaderProgressPreview,
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
import { useReaderBookmarks } from "@/src/features/reader/hooks/use-reader-bookmarks"
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

type ReaderRuntime = {
  publicationKey: string
  readerState: ReaderState | null
  publicationLanguages: string[]
  positions: Locator[]
  toc: ReaderTocItem[]
}

function emptyReaderRuntime(publicationKey: string): ReaderRuntime {
  return {
    publicationKey,
    readerState: null,
    publicationLanguages: [],
    positions: [],
    toc: [],
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
  const { readerState, publicationLanguages, positions, toc } =
    activeReaderRuntime
  const [chromeState, dispatch] = useReducer(chromeReducer, ChromeState.Reading)
  const settings = useAppStore((s) => s.settings)
  const patchReflowableReaderSettings = useAppStore(
    (s) => s.patchReflowableReaderSettings,
  )
  const patchFixedReaderSettings = useAppStore(
    (s) => s.patchFixedReaderSettings,
  )

  const navigationSheetRef = useRef<BottomSheetModal>(null)
  const settingsSheetRef = useRef<ReaderSettingsSheetRef>(null)
  const reflowReaderRef = useRef<ReadiumReflowReaderRef>(null)
  const fixedReaderRef = useRef<FixedReaderSurfaceRef>(null)
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
  const { loadState } = useBookLoader(id, formatParam, activeLibraryId)
  const activeLoadState =
    loadState.status === "ready" &&
    isReadyBookLoadForRequest(loadState, activeLibraryId, id, formatParam)
      ? loadState
      : null
  const isReflowReady = activeLoadState?.layoutMode === "reflowable"
  useReaderProgressSaver(activeLibraryId, activeLoadState, readerState)
  const {
    bookmarks,
    isCurrentLocationBookmarked,
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

  const handleBookmarkSelect = useCallback(
    (item: ReaderBookmarkItem) => {
      navigateToLocator(
        resolveReaderBookmarkNavigationLocator(
          item.locator,
          positions,
          isReflowReady ? "reflowable" : "fixed",
        ),
      )
      navigationSheetRef.current?.dismiss()
      dispatch({ type: "navigationSelect" })
    },
    [isReflowReady, navigateToLocator, positions],
  )

  const handleBookmarkDelete = useCallback(
    (item: ReaderBookmarkItem) => removeBookmark(item.locator),
    [removeBookmark],
  )

  const handleSettingsDismiss = useCallback(() => {
    dispatch({ type: "settingsDismiss" })
  }, [])

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
    if (chromeState !== ChromeState.SettingsSheet) {
      settingsSheetRef.current?.dismiss()
      return
    }

    const frame = requestAnimationFrame(() =>
      settingsSheetRef.current?.present(),
    )
    return () => cancelAnimationFrame(frame)
  }, [chromeState])

  const progressPercent = readerState?.progress ?? 0
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

  const handleOpenSettings = useCallback(() => {
    dispatch({ type: "settingsPillTap" })
  }, [])
  const currentReaderLocator = readerState?.locator
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
        active: Boolean(
          currentReaderLocator &&
            sameReaderBookmarkLocation(bookmark.locator, currentReaderLocator),
        ),
      }
    })
  }, [bookmarks, currentReaderLocator, isReflowReady, positions, t, toc])
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
    chromeState === ChromeState.SettingsSheet
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
                        onTocReady={handleTocReady}
                        onRequestClose={handleRequestClose}
                        onToggleChrome={toggleChrome}
                        theme={reflowSettings.theme}
                        fontFamily={activeFontFamily}
                        fontFamilyDeclarations={READER_FONT_DECLARATIONS}
                        fontSize={reflowSettings.fontSize}
                        lineHeight={reflowSettings.lineHeight}
                        paddingX={reflowSettings.paddingX}
                        textAlign={reflowSettings.textAlign}
                        columnCount={reflowSettings.columnCount}
                        language={readerLanguage}
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
              progressPercent={progressPercent}
              readingProgression={
                isFixedSurface ? fixedSettings.readingProgression : "ltr"
              }
              palette={chromePalette}
              onOpenToc={handleOpenToc}
              onOpenSettings={handleOpenSettings}
              onPreviewPosition={previewReaderPosition}
              onCommitPosition={handleProgressCommit}
            />

            {/* State 4: TOC/bookmarks navigation sheet */}
            <ReaderNavigationSheet
              ref={navigationSheetRef}
              toc={toc}
              activeTocIndex={activeTocIndex}
              bookmarks={bookmarkItems}
              bookmarksError={Boolean(bookmarkError)}
              bookmarksLoading={bookmarksLoading}
              bookmarksPending={bookmarkPending}
              palette={chromePalette}
              onRetryBookmarks={retryBookmarks}
              onSelectTocItem={handleTocSelect}
              onSelectBookmark={handleBookmarkSelect}
              onDeleteBookmark={handleBookmarkDelete}
              onDismiss={handleNavigationDismiss}
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
