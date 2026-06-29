import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import Feather from "@expo/vector-icons/Feather"
import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { pickReadableFormat } from "@my-reader/tools/utils"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useTranslation } from "react-i18next"
import {
  Dimensions,
  findNodeHandle,
  Platform,
  View as RNView,
} from "react-native"

import { useTheme } from "@/src/design/tokens"
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
  setReaderOpenTransition,
} from "@/src/features/reader/reader-open-transition"
import {
  BookDetailContent,
  getDetailColors,
} from "@/src/features/library/components/books/book-detail"
import { useBooks } from "@/src/features/library/hooks/useLibraryQuery"
import {
  useScreenHeader,
  type ScreenHeaderAction,
} from "@/src/navigation/hooks/use-screen-header"
import { useAppStore } from "@/src/store/app-store"

const DETAIL_COVER_BORDER_RADIUS = 8

type DetailCacheEntry = {
  detail: import("@my-reader/tools/types/book").BookDetail | null
  error: string | null
  loading: boolean
}

export default function BookDetailScreen() {
  const { t } = useTranslation()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { colorScheme, palette } = useTheme()
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

  const leftActions = useMemo<ScreenHeaderAction[] | undefined>(
    () =>
      Platform.OS === "ios"
        ? undefined
        : [
            {
              label: t("bookDetail.back"),
              onPress: handleGoBack,
              icon: (
                <Feather name="arrow-left" size={20} color={palette.text} />
              ),
              iosSfSymbol: "chevron.left",
              iconOnly: true,
              color: palette.text,
            },
          ],
    [handleGoBack, palette.text, t],
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
            color={isCurrentFavorite ? palette.primary : detailColors.muted}
          />
        ),
        iosSfSymbol: isCurrentFavorite ? "star.fill" : "star",
        iconOnly: true,
        color: isCurrentFavorite ? palette.primary : undefined,
      },
    ]
  }, [
    currentDetail,
    detailColors.muted,
    handleToggleFavorite,
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
    () => ({
      ...baseOptions,
      headerStyle: { backgroundColor: palette.background },
    }),
    [baseOptions, palette.background],
  )

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

      const startTransition = (
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
        setReaderOpenTransition({
          bookId,
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
            borderRadius: DETAIL_COVER_BORDER_RADIUS,
          }
          if (__DEV__) {
            console.info("[ReaderBookTransition] detail measure", {
              window: { x, y, width, height },
              presentedFrame,
              sourceViewTag,
              frame,
            })
          }
          startTransition(
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
        { borderRadius: DETAIL_COVER_BORDER_RADIUS },
        ({ frame, screenWidth, screenHeight, rootX, rootY }) => {
          startTransition(frame, screenWidth, screenHeight, rootX, rootY)
        },
      )
    },
    [currentDetail],
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
          bookId={currentId}
          colors={detailColors}
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
