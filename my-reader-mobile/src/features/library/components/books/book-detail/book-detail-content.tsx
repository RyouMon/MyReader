import { useCallback, useMemo, type Ref } from "react"

import { Image as ExpoImage } from "expo-image"
import { useTranslation } from "react-i18next"
import {
  Dimensions,
  PixelRatio,
  StyleSheet,
  useWindowDimensions,
  type View as RNView,
} from "react-native"

import { EmptyState } from "@/src/components/ui"
import { useBookReadingProgress } from "@/src/domain/library/hooks/use-book-reading-progress"
import type { BookItem, DataSource, Library } from "@/src/domain/types"
import { isRemoteSourceType } from "@/src/domain/types"
import { useCoverThumbnailSessionUri } from "@/src/features/library/cover-thumbnail-session-store"
import { resolveFullscreenGridCoverThumbnailSizes } from "@/src/features/library/utils/cover-thumbnail-profiles"
import type { BookDetail } from "@my-reader/tools/types/book"
import {
  formatDate,
  formatLanguage,
  IDENTIFIER_LABELS,
  stripHtml,
} from "@/src/utils/book-detail"
import { ScrollView, Text, View } from "@/tw"
import { useBookCoverUri } from "../../../hooks/use-book-cover-uri"
import { useBookDetailFormats } from "../../../hooks/use-book-detail-formats"
import { useBookDetailReadState } from "../../../hooks/use-book-detail-read-state"
import { useCoverThumbnails } from "../../../hooks/use-cover-thumbnails"
import { FormatSection } from "./format-section"
import {
  resolveBookDetailHeroMode,
  resolveNarrowBookDetailCoverHeight,
} from "./hero-layout"
import { HeroSection } from "./hero-section"
import { InfoRowSection } from "./info-row-section"
import { SynopsisSection } from "./synopsis-section"
import type { DetailColors, InfoCardItem } from "./types"

type BookDetailContentProps = {
  activeLibrary: Library
  availableWidth: number
  bookId: string
  colors: DetailColors
  contentTopInset: number
  detail: BookDetail | null
  detailError: string | null
  detailCoverRef?: Ref<RNView>
  listBook: BookItem | null
  loadingDetail: boolean
  onOpenReader: (
    bookId: string,
    format: string | null,
    coverUri?: BookItem["coverUri"],
  ) => void
  onSelectFormat: (bookId: string, format: string | null) => void
  selectedFormat: string | null
  dataSources: DataSource[]
}

const BOOK_DETAIL_MAX_CONTENT_WIDTH = 1120

export function BookDetailContent({
  activeLibrary,
  availableWidth,
  bookId,
  colors,
  contentTopInset,
  detail,
  detailError,
  detailCoverRef,
  listBook,
  loadingDetail,
  onOpenReader,
  onSelectFormat,
  selectedFormat,
  dataSources,
}: BookDetailContentProps) {
  const { t } = useTranslation()
  const {
    fontScale,
    height: windowHeight,
    width: windowWidth,
  } = useWindowDimensions()
  const screenBounds = Dimensions.get("screen")
  const pixelRatio = PixelRatio.get()
  const contentWidth = Math.min(availableWidth, BOOK_DETAIL_MAX_CONTENT_WIDTH)
  const heroMode = resolveBookDetailHeroMode(contentWidth)

  const { data: progressByBookId } = useBookReadingProgress(activeLibrary)
  const { coverUri } = useBookCoverUri(
    activeLibrary,
    detail,
    listBook,
    dataSources,
  )
  const coverBook = useMemo<BookItem>(
    () =>
      listBook ?? {
        id: bookId,
        author: detail?.authors.filter(Boolean).join(", ") ?? "",
        coverUri,
        timestamp: detail?.timestamp,
        title: detail?.title ?? "",
      },
    [bookId, coverUri, detail, listBook],
  )
  const coverThumbnailGridSizes = useMemo(
    () =>
      resolveFullscreenGridCoverThumbnailSizes({
        pixelRatio,
        screenHeight: Math.max(screenBounds.height, windowHeight),
        screenWidth: Math.max(screenBounds.width, windowWidth),
      }),
    [
      pixelRatio,
      screenBounds.height,
      screenBounds.width,
      windowHeight,
      windowWidth,
    ],
  )
  const coverThumbnailBooks = useMemo(
    () => (coverBook.coverUri ? [coverBook] : []),
    [coverBook],
  )
  const thumbnailScopeKey = useCoverThumbnails({
    enabled: !!coverBook.coverUri,
    generateMissing: false,
    library: activeLibrary,
    books: coverThumbnailBooks,
    thumbnailSizes: coverThumbnailGridSizes,
    width: contentWidth,
    height: Math.round(contentWidth * 1.5),
  })
  const thumbnailCoverUri = useCoverThumbnailSessionUri(
    thumbnailScopeKey,
    coverBook,
  )
  const loadingCoverUri = thumbnailCoverUri ?? coverUri ?? coverBook.coverUri
  const loadingCoverWidth = Math.round(
    heroMode === "narrow"
      ? contentWidth
      : Math.min(280, Math.max(152, (contentWidth - 48) * 0.33)),
  )
  const loadingCoverHeight = Math.round(
    heroMode === "narrow"
      ? resolveNarrowBookDetailCoverHeight(contentWidth, fontScale)
      : loadingCoverWidth * 1.5,
  )

  const {
    formatInfoMap,
    handleDownloadFormat,
    handleDeleteFormat,
    handleShareFormat,
  } = useBookDetailFormats(activeLibrary, bookId, detail)

  const progressByFormat = progressByBookId?.[bookId]

  const handleOpenReader = useCallback(
    (targetBookId: string, format: string | null) => {
      onOpenReader(targetBookId, format, coverUri)
    },
    [coverUri, onOpenReader],
  )

  const {
    readableFormats,
    readableSelectedFormat,
    canReadInApp,
    handleReadAction,
    readButtonTitle,
  } = useBookDetailReadState(
    activeLibrary,
    bookId,
    detail,
    selectedFormat,
    progressByFormat,
    formatInfoMap,
    handleOpenReader,
    handleDownloadFormat,
  )

  const handleSetDefaultFormat = useCallback(
    (format: string) => {
      onSelectFormat(bookId, format)
    },
    [bookId, onSelectFormat],
  )

  const formatSizeMap = useMemo(() => {
    const m = new Map<string, number>()
    if (!detail) return m
    for (const fs of detail.formatSizes) {
      m.set(fs.format.toUpperCase(), fs.sizeBytes)
    }
    return m
  }, [detail])

  if (loadingDetail) {
    return (
      <View
        className={
          heroMode === "wide"
            ? "flex-1 items-start px-4"
            : "flex-1 items-center"
        }
        style={{ backgroundColor: colors.background }}
      >
        {loadingCoverUri ? (
          <ExpoImage
            cachePolicy="memory-disk"
            contentFit="cover"
            recyclingKey={`book-detail-loading-${bookId}`}
            source={loadingCoverUri}
            style={{
              borderRadius: heroMode === "wide" ? 8 : 0,
              height: loadingCoverHeight,
              marginTop: heroMode === "wide" ? 16 : 0,
              width: loadingCoverWidth,
            }}
            testID="book-detail-loading-cover"
          />
        ) : null}
        <Text
          className={loadingCoverUri ? "mt-4 text-base" : "my-auto text-base"}
          style={{ color: colors.palette.textMuted }}
        >
          {t("bookDetail.loadingDetail")}
        </Text>
      </View>
    )
  }

  if (detailError || !detail) {
    return (
      <View
        className="flex-1 px-4 pt-4"
        style={{ backgroundColor: colors.background }}
      >
        <EmptyState
          title={t("bookDetail.notFound.title")}
          detail={detailError ?? t("bookDetail.notFound.detail")}
        />
      </View>
    )
  }

  const book = detail
  const authorsText = book.authors.filter(Boolean).join(", ") || "—"
  const tagsText = book.tags.filter(Boolean).join(", ") || "—"
  const identifierValue = book.identifiers
    .filter((ident) => ident.value.length > 0)
    .map(
      (ident) =>
        `${IDENTIFIER_LABELS[ident.idType] ?? ident.idType}: ${ident.value}`,
    )
    .join("\n")
  const langDisplay = book.languages.map(formatLanguage).join(", ")
  const ratingStars = book.rating ? Math.round(book.rating / 2) : 0
  const ratingValue = book.rating ? (book.rating / 2).toFixed(1) : null
  const synopsisText = book.comment ? stripHtml(book.comment) : ""
  const readingProgress = readableSelectedFormat
    ? (progressByFormat?.[readableSelectedFormat.toUpperCase()] ?? 0)
    : 0

  const bookInfoRows: InfoCardItem[] = [
    { label: t("bookDetail.bookTitle"), value: book.title },
    { label: t("bookDetail.titleSort"), value: book.titleSort || "—" },
    { label: t("bookDetail.authors"), value: authorsText },
    { label: t("bookDetail.authorSort"), value: book.authorSort || "—" },
    { label: t("bookDetail.series"), value: book.series || "—" },
    {
      label: t("bookDetail.seriesIndex"),
      value: book.seriesIndex !== null ? String(book.seriesIndex) : "—",
    },
    ...(ratingValue
      ? [
          {
            label: t("bookDetail.rating"),
            value: `${"★".repeat(ratingStars)}${"☆".repeat(5 - ratingStars)} ${ratingValue}`,
          },
        ]
      : []),
    { label: t("bookDetail.tags"), value: tagsText },
    { label: t("bookDetail.identifiers"), value: identifierValue || "—" },
    { label: t("bookDetail.createdAt"), value: formatDate(book.timestamp) },
    { label: t("bookDetail.pubDate"), value: formatDate(book.pubdate) },
    { label: t("bookDetail.publisher"), value: book.publisher || "—" },
    { label: t("bookDetail.language"), value: langDisplay || "—" },
  ]

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {heroMode === "wide" && coverUri ? (
        <ExpoImage
          accessible={false}
          accessibilityElementsHidden
          cachePolicy="memory-disk"
          contentFit="cover"
          importantForAccessibility="no"
          pointerEvents="none"
          recyclingKey={`book-detail-backdrop-${bookId}`}
          source={thumbnailCoverUri ?? coverUri}
          style={[StyleSheet.absoluteFill, { opacity: 0.055 }]}
          testID="book-detail-backdrop"
        />
      ) : null}
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior={
          heroMode === "narrow" ? "never" : "automatic"
        }
        contentContainerClassName="pb-8"
        contentContainerStyle={{ paddingTop: contentTopInset }}
        style={{ backgroundColor: "transparent" }}
        testID="book-detail-scroll-view"
      >
        <View
          className="w-full self-center gap-5"
          style={{ maxWidth: BOOK_DETAIL_MAX_CONTENT_WIDTH }}
        >
          <HeroSection
            availableWidth={contentWidth}
            book={book}
            canReadInApp={canReadInApp}
            colors={colors}
            coverRef={detailCoverRef}
            coverUri={coverUri}
            formats={readableFormats}
            onRead={handleReadAction}
            onSetFormat={handleSetDefaultFormat}
            readingProgress={readingProgress}
            readButtonTitle={readButtonTitle}
            selectedFormat={readableSelectedFormat}
            thumbnailScopeKey={thumbnailScopeKey}
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
              onShareFormat={handleShareFormat}
              progressByFormat={progressByFormat}
              readableFormats={readableFormats}
            />
          ) : null}

          <InfoRowSection
            items={bookInfoRows}
            title={t("bookDetail.infoSection")}
          />
        </View>
      </ScrollView>
    </View>
  )
}
