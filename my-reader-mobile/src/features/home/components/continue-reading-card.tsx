import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Platform, View as RNView } from "react-native"

import { MenuView, type MenuAction } from "@react-native-menu/menu"

import { ICON_SIZE } from "@/src/design/icon-sizes"
import {
  androidRippleColor,
  pressedBackgroundColor,
} from "@/src/design/press-feedback"
import { useTheme, useThemePalette } from "@/src/design/tokens"
import { Image, Pressable, Text, View } from "@/tw"

import { HeroCard, ProgressBar } from "@/src/components"
import { BookDownloadStatusIndicator } from "@/src/components/book-download-status-indicator"
import { CoverAdaptiveBackground } from "@/src/components/cover-adaptive-background"
import { MoreActionsIcon } from "@/src/components/ui/more-actions-icon"
import { useCoverPalette } from "@/src/domain/library/hooks/use-cover-palette"
import type { BookItem } from "@/src/domain/types"
import type { BookDownloadStatus } from "@/src/features/library/components/books/book-cover"
import {
  canStartReaderOpenTransition,
  measureReaderTransitionFrame,
  primeReaderCoverCache,
  setReaderOpenTransition,
} from "@/src/features/reader/reader-open-transition"
import type { HomeCardStyle } from "@/src/store/app-store.types"

const CONTINUE_READING_COVER_BORDER_RADIUS = 16

type ContinueReadingCardProps = {
  book: BookItem & { readingProgress: number; readingFormat: string }
  downloadStatus?: BookDownloadStatus
  libraryId?: string
  menuActions?: MenuAction[]
  homeCardStyle?: HomeCardStyle
  isAnyMenuOpen?: boolean
  onPress?: () => void
  onMenuAction?: (actionId: string) => void
  onMenuOpen?: () => void
  onMenuClose?: () => void
}

export function ContinueReadingCard({
  book,
  downloadStatus,
  libraryId,
  menuActions,
  homeCardStyle,
  isAnyMenuOpen,
  onPress,
  onMenuAction,
  onMenuOpen,
  onMenuClose,
}: ContinueReadingCardProps) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { colorScheme } = useTheme()
  const resolvedScheme = colorScheme === "dark" ? "dark" : "light"
  const { raw: coverRawColors } = useCoverPalette(book.coverUri, resolvedScheme)
  const coverRef = useRef<RNView>(null)

  useEffect(() => {
    primeReaderCoverCache(book.coverUri)
  }, [book.coverUri])

  const handlePress = () => {
    if (isAnyMenuOpen || !onPress) return
    if (!canStartReaderOpenTransition(downloadStatus)) {
      onPress()
      return
    }
    const coverNode = coverRef.current
    if (!coverNode) {
      onPress()
      return
    }

    measureReaderTransitionFrame(
      coverNode,
      { borderRadius: CONTINUE_READING_COVER_BORDER_RADIUS },
      ({ frame, screenWidth, screenHeight, rootX, rootY }) => {
        setReaderOpenTransition({
          bookId: book.id,
          format: book.readingFormat,
          coverUri: book.coverUri,
          title: book.title,
          frame,
          screenWidth,
          screenHeight,
          rootX,
          rootY,
        })
        requestAnimationFrame(onPress)
      },
    )
  }

  const handleMenuAction = ({
    nativeEvent,
  }: {
    nativeEvent: { event: string }
  }) => {
    onMenuAction?.(nativeEvent.event)
  }

  const menuTrigger = (
    <View
      accessibilityRole="button"
      accessibilityLabel={t("bookDetail.moreActions", { title: book.title })}
      className="h-8 w-8 items-center justify-center"
    >
      <MoreActionsIcon size={ICON_SIZE.base} color={palette.textMuted} />
    </View>
  )
  const coverNode = book.coverUri ? (
    <Image
      source={book.coverUri}
      className="h-[168px] w-[112px] rounded-2xl"
      cachePolicy="memory-disk"
      recyclingKey={book.id}
    />
  ) : (
    <View
      className="h-[168px] w-[112px] items-center justify-center rounded-2xl"
      style={{ backgroundColor: palette.background }}
    >
      <Text
        className="text-sm"
        style={{ color: palette.textMuted, fontWeight: "600" }}
      >
        {t("home.noCover")}
      </Text>
    </View>
  )

  return (
    <HeroCard>
      <View className="relative">
        <CoverAdaptiveBackground
          coverUri={book.coverUri}
          rawColors={coverRawColors}
          colorScheme={resolvedScheme}
          variant={homeCardStyle}
        />
        {menuActions && menuActions.length > 0 ? (
          <MenuView
            actions={menuActions}
            isAnchoredToRight={Platform.OS === "android"}
            onOpenMenu={onMenuOpen}
            onCloseMenu={onMenuClose}
            onPressAction={handleMenuAction}
            style={{ position: "absolute", right: 12, top: 12, zIndex: 10 }}
          >
            {menuTrigger}
          </MenuView>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("bookDetail.openBook", { title: book.title })}
          onPress={handlePress}
          android_ripple={{
            color: androidRippleColor(resolvedScheme, palette),
            foreground: true,
          }}
          style={({ pressed }) => ({
            overflow: "hidden",
            backgroundColor:
              Platform.OS === "ios" && pressed
                ? pressedBackgroundColor(resolvedScheme, palette)
                : undefined,
          })}
        >
          <View className="flex-row items-start gap-3 p-3">
            <RNView
              ref={coverRef}
              collapsable={false}
              style={{
                borderRadius: CONTINUE_READING_COVER_BORDER_RADIUS,
                overflow: "hidden",
              }}
            >
              {coverNode}
            </RNView>
            <View
              className="min-w-0 flex-1 justify-center gap-2"
              style={{ height: 168 }}
            >
              <Text
                className="text-xl font-bold"
                style={{ color: palette.text }}
                numberOfLines={2}
              >
                {book.title}
              </Text>
              <Text
                className="text-base font-semibold"
                style={{ color: palette.textMuted }}
              >
                {book.author}
              </Text>
              <View className="flex-row items-center gap-1.5">
                <Text
                  className="text-sm font-semibold"
                  style={{
                    color: palette.textMuted,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {Math.round(book.readingProgress)}%
                </Text>
                <BookDownloadStatusIndicator
                  status={downloadStatus}
                  libraryId={libraryId}
                  bookId={book.id}
                  format={book.readingFormat}
                />
              </View>
              <ProgressBar progress={book.readingProgress / 100} />
            </View>
            {menuActions && menuActions.length > 0 ? (
              <View className="w-8" />
            ) : null}
          </View>
        </Pressable>
      </View>
    </HeroCard>
  )
}
