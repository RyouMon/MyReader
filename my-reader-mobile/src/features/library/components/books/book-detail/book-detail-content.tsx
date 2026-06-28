import { useCallback, useMemo } from "react"

import { useTranslation } from "react-i18next"

import { EmptyState } from "@/src/components/ui"
import { useBookReadingProgress } from "@/src/domain/library/hooks/use-book-reading-progress"
import type { BookItem, DataSource, Library } from "@/src/domain/types"
import { isRemoteSourceType } from "@/src/domain/types"
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
import { FormatSection } from "./format-section"
import { HeroSection } from "./hero-section"
import { InfoRowSection } from "./info-row-section"
import { SynopsisSection } from "./synopsis-section"
import type { DetailColors, InfoCardItem } from "./types"

type BookDetailContentProps = {
  activeLibrary: Library
  bookId: string
  colors: DetailColors
  detail: BookDetail | null
  detailError: string | null
  listBook: BookItem | null
  loadingDetail: boolean
  onOpenReader: (bookId: string, format: string | null) => void
  onSelectFormat: (bookId: string, format: string | null) => void
  selectedFormat: string | null
  dataSources: DataSource[]
}

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
  const { t } = useTranslation()

  const { data: progressByBookId } = useBookReadingProgress(activeLibrary)
  const { coverUri } = useBookCoverUri(
    activeLibrary,
    detail,
    listBook,
    dataSources,
  )

  const {
    formatInfoMap,
    handleDownloadFormat,
    handleDeleteFormat,
    handleShareFormat,
  } = useBookDetailFormats(activeLibrary, bookId, detail)

  const progressByFormat = progressByBookId?.[bookId]

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
    onOpenReader,
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
        className="flex-1 items-center justify-center px-4"
        style={{ backgroundColor: colors.background }}
      >
        <Text className="text-sm" style={{ color: colors.palette.textMuted }}>
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
