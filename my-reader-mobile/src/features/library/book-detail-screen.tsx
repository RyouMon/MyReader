import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import Feather from "@expo/vector-icons/Feather"
import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { pickReadableFormat } from "@my-reader/tools/utils"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useHeaderHeight } from "expo-router/react-navigation"
import { useTranslation } from "react-i18next"
import {
  Dimensions,
  findNodeHandle,
  type LayoutChangeEvent,
  Platform,
  useWindowDimensions,
  View as RNView,
} from "react-native"

import { getThemePalette, useTheme } from "@/src/design/tokens"
import { View } from "@/tw"

import { EmptyState } from "@/src/components"
import { ErrorBoundary } from "@/src/components/error-boundary"
import { readBookDetailFromMetadata } from "@/src/domain/library/calibre"
import { useBookReadingFormat } from "@/src/domain/library/hooks/use-book-reading-format"
import { useFavoriteBooks } from "@/src/domain/library/hooks/use-favorite-books"
import type { BookItem } from "@/src/domain/types"
import {
  getReaderTransitionPresentedViewFrame,
  measureReaderTransitionFrame,
  startReaderOpenTransition,
} from "@/src/features/reader/reader-open-transition"
import {
  BookDetailContent,
  getDetailColors,
} from "@/src/features/library/components/books/book-detail"
import {
  resolveBookDetailContentTopInset,
  resolveBookDetailHeroMode,
} from "@/src/features/library/components/books/book-detail/hero-layout"
import { useBooks } from "@/src/features/library/hooks/useLibraryQuery"
import {
  useScreenHeader,
  type ScreenHeaderAction,
} from "@/src/navigation/hooks/use-screen-header"
import { useAppStore } from "@/src/store/app-store"
import { buildBookDetailScreenOptions } from "./book-detail-screen-options"

const DETAIL_COVER_BORDER_RADIUS = 8
const COVER_HEADER_PALETTE = getThemePalette("dark")

type DetailCacheEntry = {
  detail: import("@my-reader/tools/types/book").BookDetail | null
  error: string | null
  loading: boolean
}

export default function BookDetailScreen() {
  const { t } = useTranslation()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { colorScheme, palette } = useTheme()
  const headerHeight = useHeaderHeight()
  const { width: windowWidth } = useWindowDimensions()
  const [detailLayoutWidth, setDetailLayoutWidth] = useState<number | null>(
    null,
  )
  const activeLibraryId = useAppStore((s) => s.activeLibraryId)
  const { data: books = [] } = useBooks(activeLibraryId)
  const libraries = useAppStore((s) => s.libraries)
  const activeLibrary = useMemo(
    () => libraries.find((l) => l.id === activeLibraryId) ?? null,
    [libraries, activeLibraryId],
  )
  const dataSources = useAppStore((s) => s.dataSources)
  const [currentId, setCurrentId] = useState<string | null>(id ?? null)
  const [detailCache, setDetailCache] = useState<
    Record<string, DetailCacheEntry>
  >({})
  const detailCacheRef = useRef(detailCache)
  const loadingIdsRef = useRef(new Set<string>())
  const detailCoverRef = useRef<RNView>(null)
  const { selectedFormatById, setBookReadingFormat } =
    useBookReadingFormat(activeLibrary)
  const { isFavorite, toggleFavorite } = useFavoriteBooks(activeLibrary, books)

  useEffect(() => {
    if (id && currentId === null) {
      setCurrentId(id)
    }
  }, [currentId, id])

  useEffect(() => {
    setDetailCache({})
    loadingIdsRef.current.clear()
  }, [activeLibraryId])

  useEffect(() => {
    detailCacheRef.current = detailCache
  }, [detailCache])

  useEffect(() => {
    if (!activeLibrary || !currentId) return
    let cancelled = false

    const cacheEntry = detailCacheRef.current[currentId]
    if (cacheEntry || loadingIdsRef.current.has(currentId)) {
      return
    }

    const numericId = Number(currentId)
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setDetailCache((prev) => ({
        ...prev,
        [currentId]: {
          detail: null,
          error: t("bookDetail.invalidId"),
          loading: false,
        },
      }))
      return
    }

    loadingIdsRef.current.add(currentId)
    setDetailCache((prev) => ({
      ...prev,
      [currentId]: {
        detail: null,
        error: null,
        loading: true,
      },
    }))

    void readBookDetailFromMetadata(activeLibrary, Math.trunc(numericId))
      .then((next) => {
        if (cancelled) return
        setDetailCache((prev) => ({
          ...prev,
          [currentId]: {
            detail: next,
            error: next ? null : t("bookDetail.notFoundInMeta"),
            loading: false,
          },
        }))
        if (next) {
          // Format selection is loaded from persisted preferences; do not override on detail load.
        }
      })
      .catch((e) => {
        if (cancelled) return
        setDetailCache((prev) => ({
          ...prev,
          [currentId]: {
            detail: null,
            error: e instanceof Error ? e.message : String(e),
            loading: false,
          },
        }))
      })
      .finally(() => {
        loadingIdsRef.current.delete(currentId)
      })

    return () => {
      cancelled = true
    }
  }, [activeLibrary, currentId, t])

  const currentEntry = currentId ? detailCache[currentId] : undefined
  const currentDetail = currentEntry?.detail ?? null

  const handleGoBack = useCallback(() => {
    router.back()
  }, [])

  const detailColors = useMemo(
    () => getDetailColors(palette, colorScheme),
    [palette, colorScheme],
  )

  const handleToggleFavorite = useCallback(() => {
    if (!currentId) return
    void toggleFavorite(currentId)
  }, [currentId, toggleFavorite])

  const isCurrentFavorite = currentId ? isFavorite(currentId) : false
  const detailAvailableWidth = detailLayoutWidth ?? windowWidth
  const detailHeroMode = resolveBookDetailHeroMode(detailAvailableWidth)
  const detailCoverBorderRadius =
    detailHeroMode === "wide" ? DETAIL_COVER_BORDER_RADIUS : 0
  const headerForeground =
    detailHeroMode === "narrow" ? COVER_HEADER_PALETTE.text : palette.text
  const showAndroidHeaderButtonBackground =
    Platform.OS === "android" && detailHeroMode === "narrow"
  const headerButtonBackground = showAndroidHeaderButtonBackground
    ? COVER_HEADER_PALETTE.overlay
    : undefined
  const headerButtonRipple = showAndroidHeaderButtonBackground
    ? COVER_HEADER_PALETTE.borderStrong
    : undefined
  const contentTopInset = resolveBookDetailContentTopInset(
    Platform.OS,
    detailHeroMode,
    headerHeight,
  )

  const leftActions = useMemo<ScreenHeaderAction[] | undefined>(
    () =>
      Platform.OS === "ios"
        ? undefined
        : [
            {
              label: t("bookDetail.back"),
              onPress: handleGoBack,
              icon: (
                <Feather name="arrow-left" size={20} color={headerForeground} />
              ),
              iosSfSymbol: "chevron.left",
              iconOnly: true,
              color: headerForeground,
              backgroundColor: headerButtonBackground,
              rippleColor: headerButtonRipple,
            },
          ],
    [
      handleGoBack,
      headerButtonBackground,
      headerButtonRipple,
      headerForeground,
      t,
    ],
  )

  const rightActions = useMemo<ScreenHeaderAction[] | undefined>(() => {
    if (!currentDetail) return undefined
    return [
      {
        label: t("bookDetail.favorite"),
        onPress: handleToggleFavorite,
        icon: (
          <MaterialIcons
            name={isCurrentFavorite ? "star" : "star-border"}
            size={22}
            color={isCurrentFavorite ? palette.primary : headerForeground}
          />
        ),
        iosSfSymbol: isCurrentFavorite ? "star.fill" : "star",
        iconOnly: true,
        color: isCurrentFavorite ? palette.primary : headerForeground,
        backgroundColor: headerButtonBackground,
        rippleColor: headerButtonRipple,
      },
    ]
  }, [
    currentDetail,
    handleToggleFavorite,
    headerButtonBackground,
    headerButtonRipple,
    headerForeground,
    isCurrentFavorite,
    palette.primary,
    t,
  ])

  const { options: baseOptions, toolbar } = useScreenHeader({
    title: t("bookDetail.title"),
    back: "hidden",
    close: Platform.OS === "ios" ? { label: t("common.close") } : undefined,
    left: leftActions,
    right: rightActions,
  })

  const options = useMemo(
    () =>
      buildBookDetailScreenOptions(
        baseOptions,
        headerForeground,
        detailHeroMode === "narrow",
      ),
    [baseOptions, detailHeroMode, headerForeground],
  )

  const handleDetailLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width
    setDetailLayoutWidth((currentWidth) =>
      currentWidth === nextWidth ? currentWidth : nextWidth,
    )
  }, [])

  const getListBook = useCallback(
    (bookId: string) => books.find((item) => item.id === bookId) ?? null,
    [books],
  )

  const handleSelectFormat = useCallback(
    (bookId: string, format: string | null) => {
      void setBookReadingFormat(bookId, format)
    },
    [setBookReadingFormat],
  )

  const openReader = useCallback(
    (
      bookId: string,
      format: string | null,
      coverUri?: BookItem["coverUri"],
    ) => {
      if (!format) return
      const navigate = () => {
        router.push({
          pathname: "/reader/[id]",
          params: { id: bookId, format },
        })
      }
      const coverNode = detailCoverRef.current
      if (!coverNode || !currentDetail) {
        navigate()
        return
      }

      const startTransition = async (
        frame: {
          x: number
          y: number
          width: number
          height: number
          borderRadius?: number
        },
        screenWidth?: number,
        screenHeight?: number,
        rootX?: number,
        rootY?: number,
        sourceViewTag?: number | null,
      ) => {
        await startReaderOpenTransition({
          bookId,
          format,
          coverUri,
          title: currentDetail.title,
          frame,
          screenWidth,
          screenHeight,
          rootX,
          rootY,
          sourceViewTag,
        })
        requestAnimationFrame(navigate)
      }

      if (Platform.OS === "ios") {
        coverNode.measureInWindow((x, y, width, height) => {
          const sourceViewTag = findNodeHandle(coverNode)
          const presentedFrame = __DEV__
            ? getReaderTransitionPresentedViewFrame()
            : null
          const frame = {
            x,
            y,
            width,
            height,
            borderRadius: detailCoverBorderRadius,
          }
          if (__DEV__) {
            console.info("[ReaderBookTransition] detail measure", {
              window: { x, y, width, height },
              presentedFrame,
              sourceViewTag,
              frame,
            })
          }
          void startTransition(
            frame,
            Dimensions.get("window").width,
            Dimensions.get("window").height,
            0,
            0,
            sourceViewTag,
          )
        })
        return
      }

      measureReaderTransitionFrame(
        coverNode,
        { borderRadius: detailCoverBorderRadius },
        ({ frame, screenWidth, screenHeight, rootX, rootY }) => {
          void startTransition(frame, screenWidth, screenHeight, rootX, rootY)
        },
      )
    },
    [currentDetail, detailCoverBorderRadius],
  )

  const selectedFormat = currentId
    ? (selectedFormatById[currentId] ??
      (currentEntry?.detail
        ? pickReadableFormat(currentEntry.detail.formats)
        : null))
    : null

  if (!currentId) {
    return (
      <>
        <Stack.Screen options={options} />
        {toolbar}
        <View
          className="flex-1 px-4 pt-4"
          style={{ backgroundColor: palette.background }}
        >
          <EmptyState
            title={t("bookDetail.missingParam.title")}
            detail={t("bookDetail.missingParam.detail")}
            icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }}
          />
        </View>
      </>
    )
  }

  if (!activeLibraryId || !activeLibrary) {
    return (
      <>
        <Stack.Screen options={options} />
        {toolbar}
        <View
          className="flex-1 px-4 pt-4"
          style={{ backgroundColor: palette.background }}
        >
          <EmptyState
            title={t("bookDetail.noLibrary.title")}
            detail={t("bookDetail.noLibrary.detail")}
            icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }}
          />
        </View>
      </>
    )
  }

  return (
    <View
      className="flex-1 overflow-hidden"
      onLayout={handleDetailLayout}
      style={{ backgroundColor: palette.background }}
    >
      <Stack.Screen options={options} />
      {toolbar}
      <ErrorBoundary
        title={t("bookDetail.loadFailed")}
        message={t("bookDetail.loadFailedMessage")}
        onRetry={() => {
          if (currentId) {
            loadingIdsRef.current.delete(currentId)
            setDetailCache((prev) => {
              const next = { ...prev }
              delete next[currentId]
              return next
            })
          }
        }}
      >
        <BookDetailContent
          activeLibrary={activeLibrary}
          availableWidth={detailAvailableWidth}
          bookId={currentId}
          colors={detailColors}
          contentTopInset={contentTopInset}
          detail={currentEntry?.detail ?? null}
          detailError={currentEntry?.error ?? null}
          detailCoverRef={detailCoverRef}
          listBook={getListBook(currentId)}
          loadingDetail={currentEntry?.loading ?? true}
          onOpenReader={openReader}
          onSelectFormat={handleSelectFormat}
          selectedFormat={selectedFormat}
          dataSources={dataSources}
        />
      </ErrorBoundary>
    </View>
  )
}
