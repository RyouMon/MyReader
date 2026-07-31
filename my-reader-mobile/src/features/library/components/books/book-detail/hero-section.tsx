import type { BookDetail } from "@my-reader/tools/types/book"
import type { MenuAction } from "@react-native-menu/menu"
import { MenuView } from "@react-native-menu/menu"
import { LinearGradient } from "expo-linear-gradient"
import { useMemo, type Ref } from "react"
import { useTranslation } from "react-i18next"
import { StyleSheet, useWindowDimensions, View as RNView } from "react-native"

import { Button, CircularProgress } from "@/src/components/ui"
import type { BookItem } from "@/src/domain/types"
import { Text, View } from "@/tw"
import {
  extractYear,
  formatDate,
  formatLanguage,
} from "@/src/utils/book-detail"
import { BookCover } from "../book-cover"
import {
  resolveBookDetailHeroMode,
  resolveNarrowBookDetailCoverHeight,
} from "./hero-layout"
import type { DetailColors } from "./types"

type HeroSectionProps = {
  availableWidth: number
  book: BookDetail
  colors: DetailColors
  coverUri?: BookItem["coverUri"]
  canReadInApp: boolean
  formats: string[]
  readingProgress: number
  readButtonTitle: string
  selectedFormat: string | null
  thumbnailScopeKey?: string
  coverRef?: Ref<RNView>
  onRead: () => void
  onSetFormat: (format: string) => void
}

const WIDE_COVER_MIN_WIDTH = 152
const WIDE_COVER_MAX_WIDTH = 280

export function HeroSection({
  availableWidth,
  book,
  colors,
  coverUri,
  canReadInApp,
  formats,
  readingProgress,
  readButtonTitle,
  selectedFormat,
  thumbnailScopeKey,
  coverRef,
  onRead,
  onSetFormat,
}: HeroSectionProps) {
  const { t } = useTranslation()
  const { fontScale } = useWindowDimensions()
  const authors = book.authors.filter(Boolean).join(", ") || book.authorSort
  const heroMode = resolveBookDetailHeroMode(availableWidth)
  const isWide = heroMode === "wide"
  const progressSize = isWide ? 72 : 56
  const progressStrokeWidth = isWide ? 4 : 3
  const coverWidth = Math.round(
    isWide
      ? Math.min(
          WIDE_COVER_MAX_WIDTH,
          Math.max(WIDE_COVER_MIN_WIDTH, (availableWidth - 48) * 0.33),
        )
      : availableWidth,
  )
  const coverHeight = Math.round(
    isWide
      ? coverWidth * 1.5
      : resolveNarrowBookDetailCoverHeight(availableWidth, fontScale),
  )
  const publicationYear = extractYear(book.pubdate)
  const publicationDate = book.pubdate ? formatDate(book.pubdate) : null
  const languages = book.languages.map(formatLanguage).join(", ")
  const metadata = [publicationDate, book.publisher, languages].filter(Boolean)
  const seriesIndex =
    book.seriesIndex !== null
      ? Number.isInteger(book.seriesIndex)
        ? String(book.seriesIndex)
        : book.seriesIndex.toFixed(1)
      : null
  const seriesLabel = book.series
    ? seriesIndex
      ? t("bookDetail.seriesInfo", { series: book.series, index: seriesIndex })
      : book.series
    : null
  const progressPercent = Math.round(
    Math.min(100, Math.max(0, readingProgress)),
  )
  const coverBook = useMemo<BookItem>(
    () => ({
      id: String(book.id),
      title: book.title,
      author: authors,
      coverUri,
      timestamp: book.timestamp,
    }),
    [authors, book.id, book.timestamp, book.title, coverUri],
  )

  const formatMenuActions = useMemo<MenuAction[]>(
    () =>
      formats.map((format) => ({
        id: format,
        title: format,
        state:
          format.toUpperCase() === selectedFormat?.toUpperCase()
            ? ("on" as const)
            : undefined,
      })),
    [formats, selectedFormat],
  )

  const handleFormatMenuAction = ({
    nativeEvent,
  }: {
    nativeEvent: { event: string }
  }) => {
    onSetFormat(nativeEvent.event)
  }

  const heroDetails = (
    <View className="gap-4">
      <Text
        className="text-base"
        style={{ color: colors.accent, fontWeight: "600" }}
      >
        {authors}
      </Text>

      {metadata.length > 0 ? (
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          {metadata.map((item, index) => (
            <View
              key={`${item}-${index}`}
              className="flex-row items-center gap-2"
            >
              {index > 0 ? (
                <Text className="text-base" style={{ color: colors.tertiary }}>
                  ·
                </Text>
              ) : null}
              <Text className="text-base" style={{ color: colors.muted }}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {book.tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {book.tags.slice(0, 4).map((tag) => (
            <View
              key={tag}
              className="justify-center rounded-md border px-2.5 py-1"
              style={{ borderColor: colors.border }}
            >
              <Text
                className="text-base"
                style={{ color: colors.muted, fontWeight: "500" }}
              >
                {tag}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View
        accessible
        accessibilityLabel={t("bookDetail.readingProgress")}
        accessibilityRole="progressbar"
        accessibilityValue={{
          max: 100,
          min: 0,
          now: progressPercent,
          text: `${progressPercent}%`,
        }}
        className="flex-row items-center gap-3"
      >
        <View
          accessible={false}
          accessibilityElementsHidden
          className="flex-row items-center gap-3"
          importantForAccessibility="no-hide-descendants"
        >
          <View
            className="items-center justify-center"
            style={{ height: progressSize, width: progressSize }}
          >
            <CircularProgress
              color={colors.accent}
              progress={progressPercent / 100}
              size={progressSize}
              strokeWidth={progressStrokeWidth}
              trackColor={colors.border}
            />
            <View
              className="absolute inset-0 items-center justify-center"
              pointerEvents="none"
            >
              <Text
                className="text-base"
                style={{ color: colors.text, fontWeight: "700" }}
              >
                {progressPercent}%
              </Text>
            </View>
          </View>
          <View className="min-w-0">
            <Text
              className="text-base"
              style={{ color: colors.text, fontWeight: "600" }}
            >
              {t("bookDetail.readingProgress")}
            </Text>
            <Text className="mt-0.5 text-base" style={{ color: colors.muted }}>
              {progressPercent}%
            </Text>
          </View>
        </View>
      </View>

      <View className="w-full flex-row gap-3" style={{ maxWidth: 420 }}>
        <Button
          accessibilityLabel={readButtonTitle}
          className="flex-1"
          colors={{
            backgroundColor: colors.accent,
            borderColor: colors.accent,
            textColor: colors.accentText,
            underlayColor: colors.accentPressed,
          }}
          disabled={!canReadInApp}
          onPress={onRead}
          size="lg"
          textClassName="text-base"
          textStyle={{ fontWeight: "600" }}
          title={readButtonTitle}
          variant="primary"
        />
        <View className="flex-1">
          <Button
            accessibilityLabel={t("bookDetail.setReadingFormat")}
            className="flex-1"
            onPress={() => {}}
            size="lg"
            textClassName="text-base"
            textStyle={{ fontWeight: "600" }}
            title={t("bookDetail.setReadingFormat")}
            variant="secondary"
          />
          <MenuView
            actions={formatMenuActions}
            onPressAction={handleFormatMenuAction}
            shouldOpenOnLongPress={false}
            style={StyleSheet.absoluteFill}
          >
            <View style={{ width: "100%", height: "100%" }} />
          </MenuView>
        </View>
      </View>
    </View>
  )

  if (isWide) {
    return (
      <View className="px-4 pt-4" testID="book-detail-hero-wide">
        <View className="flex-row gap-6">
          <RNView
            ref={coverRef}
            accessible
            accessibilityLabel={book.title}
            accessibilityRole="image"
            collapsable={false}
            style={{ height: coverHeight, width: coverWidth }}
          >
            <BookCover
              book={coverBook}
              width={coverWidth}
              height={coverHeight}
              borderRadius={8}
              thumbnailScopeKey={thumbnailScopeKey}
              thumbnailUsage="placeholder"
            />
          </RNView>

          <View className="min-w-0 flex-1 gap-4 py-1">
            <View className="gap-2">
              <Text
                className="text-3xl"
                style={{ color: colors.text, fontWeight: "700" }}
              >
                {book.title}
                {publicationYear ? (
                  <Text style={{ color: colors.muted, fontWeight: "400" }}>
                    {` (${publicationYear})`}
                  </Text>
                ) : null}
              </Text>
              {seriesLabel ? (
                <Text
                  className="text-base"
                  style={{ color: colors.muted, fontWeight: "600" }}
                >
                  {seriesLabel}
                </Text>
              ) : null}
            </View>

            {heroDetails}
          </View>
        </View>
      </View>
    )
  }

  return (
    <View testID="book-detail-hero-narrow">
      <View
        style={{ height: coverHeight, position: "relative", width: coverWidth }}
      >
        <RNView
          ref={coverRef}
          accessible
          accessibilityLabel={book.title}
          accessibilityRole="image"
          collapsable={false}
          style={StyleSheet.absoluteFill}
        >
          <BookCover
            book={coverBook}
            width={coverWidth}
            height={coverHeight}
            borderRadius={0}
            shadowEnabled={false}
            thumbnailScopeKey={thumbnailScopeKey}
            thumbnailUsage="placeholder"
          />
        </RNView>

        <LinearGradient
          colors={[
            "transparent",
            "transparent",
            colors.palette.overlayStrong,
            colors.background,
          ]}
          locations={[0, 0.48, 0.76, 1]}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          testID="book-detail-cover-transition"
        />

        <View
          className="absolute inset-x-0 px-4"
          style={{ bottom: 32 }}
          testID="book-detail-cover-title"
        >
          <Text
            className="text-3xl"
            numberOfLines={3}
            testID="book-detail-title"
            style={{ color: colors.text, fontWeight: "700" }}
          >
            {book.title}
            {publicationYear ? (
              <Text style={{ color: colors.muted, fontWeight: "400" }}>
                {` (${publicationYear})`}
              </Text>
            ) : null}
          </Text>
          {seriesLabel ? (
            <Text
              className="mt-2 text-base"
              numberOfLines={2}
              style={{ color: colors.muted, fontWeight: "600" }}
            >
              {seriesLabel}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        className="px-4"
        style={{ backgroundColor: colors.background }}
        testID="book-detail-narrow-details"
      >
        {heroDetails}
      </View>
    </View>
  )
}
