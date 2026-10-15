import { useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SectionList,
  Text,
  View,
  useWindowDimensions,
} from "react-native"
import { FlashList, type FlashListRef } from "@shopify/flash-list"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useHeaderHeight } from "expo-router/react-navigation"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import {
  groupCatalogFacets,
  EMPTY_NAVIGATION,
  isFacetKind,
  type CatalogFacet,
  type CatalogToken,
} from "@my-reader/tools/catalog-navigation"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { useThemePalette } from "@/src/design/tokens"
import {
  LIBRARY_GRID_CARD_GAP,
  LIBRARY_GRID_CELL_CONTAINER_STYLE,
  LIBRARY_GRID_PADDING_X,
} from "@/src/config/library-list-performance"
import { useAppStore } from "@/src/store/app-store"
import { useBooks, useCatalogNavigation } from "./hooks/useLibraryQuery"
import { useCatalogSearchPresentation } from "./hooks/use-catalog-search-presentation"
import { CatalogTokenField } from "./components/catalog-token-field"
import { AlphabetRail } from "./components/alphabet-rail"
import { BookCover } from "./components/books/book-cover"
import type { BookItem } from "@/src/domain/types"
import {
  resolveLibraryGridColumns,
  resolveLibraryGridCardWidth,
} from "./utils/cover-thumbnail-profiles"

function SeriesItem({
  facet,
  width,
  list,
  books,
  onPress,
}: {
  facet: CatalogFacet
  width: number
  list: boolean
  books: Map<string, BookItem>
  onPress: () => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const coverWidth = list ? 40 : width
  const coverHeight = coverWidth * 1.5
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        paddingVertical: 8,
        ...LIBRARY_GRID_CELL_CONTAINER_STYLE,
        width: list ? "100%" : width + LIBRARY_GRID_CARD_GAP,
        flexDirection: list ? "row" : "column",
        gap: 8,
        alignItems: list ? "center" : undefined,
      }}
    >
      <View
        style={{
          width: coverWidth,
          height: coverHeight,
          flexDirection: "row",
          flexWrap: "wrap",
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: palette.surface,
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: 4 }, (_, index) => {
          const cover = facet.covers[index]
          const book = cover
            ? (books.get(String(cover.id)) ?? {
                id: String(cover.id),
                title: cover.title,
                author: "",
              })
            : null
          return (
            <View
              key={index}
              style={{ width: coverWidth / 2, height: coverHeight / 2 }}
            >
              {book && (
                <BookCover
                  book={book}
                  width={coverWidth / 2}
                  height={coverHeight / 2}
                  borderRadius={0}
                  shadowEnabled={false}
                />
              )}
            </View>
          )
        })}
      </View>
      <View style={{ flex: list ? 1 : undefined, gap: 3 }}>
        <Text
          numberOfLines={2}
          style={{ fontSize: 15, fontWeight: "600", color: palette.text }}
        >
          {facet.name}
        </Text>
        <Text style={{ fontSize: 12, color: palette.textMuted }}>
          {t("library.collections.bookCount", { count: facet.bookCount })}
        </Text>
      </View>
    </Pressable>
  )
}

export default function CatalogDirectoryScreen() {
  const { t } = useTranslation()
  const { kind: requestedKind } = useLocalSearchParams<{ kind: string }>()
  const kind = isFacetKind(requestedKind) ? requestedKind : "authors"
  const palette = useThemePalette()
  const libraryId = useAppStore((state) => state.activeLibraryId)
  const viewMode = useAppStore((state) => state.libraryViewMode)
  const setViewMode = useAppStore((state) => state.setLibraryViewMode)
  const { width } = useWindowDimensions()
  const headerHeight = useHeaderHeight()
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState("")
  const navigation = useCatalogNavigation(libraryId)
  const { data: books = [] } = useBooks(libraryId)
  const bookMap = useMemo(
    () => new Map(books.map((book) => [book.id, book])),
    [books],
  )
  const facets = useMemo(
    () =>
      (navigation.data?.[kind] ?? []).filter((facet) =>
        facet.name
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      ),
    [navigation.data, kind, query],
  )
  const sections = useMemo(() => groupCatalogFacets(facets), [facets])
  const list = useRef<SectionList<CatalogFacet>>(null)
  const [searchHeaderHeight, setSearchHeaderHeight] = useState(0)
  const seriesList = useRef<FlashListRef<CatalogFacet>>(null)
  const searchPresentation = useCatalogSearchPresentation(
    `${libraryId}:${kind}`,
    false,
    () => {
      if (kind === "series")
        seriesList.current?.scrollToOffset({ offset: 0, animated: false })
      else if (sections.length)
        list.current?.scrollToLocation({
          sectionIndex: 0,
          itemIndex: 0,
          animated: false,
        })
    },
  )
  const layouts = useMemo(() => {
    let offset = searchPresentation.isOpen ? searchHeaderHeight : 0
    return sections
      .flatMap((section) => [32, ...section.data.map(() => 52), 0])
      .map((length, index) => {
        const layout = { index, length, offset }
        offset += length
        return layout
      })
  }, [sections, searchPresentation.isOpen, searchHeaderHeight])
  const { options, toolbar } = useScreenHeader({
    title: t(`catalog.${kind}`),
    headerLargeTitle: true,
    right: [
      ...(kind === "series"
        ? [
            {
              label: t(
                viewMode === "grid" ? "library.view.list" : "library.view.grid",
              ),
              iosSfSymbol:
                viewMode === "grid"
                  ? ("list.bullet" as const)
                  : ("square.grid.2x2" as const),
              onPress: () => setViewMode(viewMode === "grid" ? "list" : "grid"),
            },
          ]
        : []),
      searchPresentation.action,
    ],
  })
  const select = (token: CatalogToken) => {
    if (libraryId)
      router.push({
        pathname: "/library/catalog",
        params: { libraryId, tokens: JSON.stringify([token]) },
      })
  }
  const searchField = searchPresentation.isOpen ? (
    <View
      style={kind === "series" ? LIBRARY_GRID_CELL_CONTAINER_STYLE : undefined}
      onLayout={(event) =>
        setSearchHeaderHeight(event.nativeEvent.layout.height)
      }
    >
      <CatalogTokenField
        tokens={[]}
        onTokensChange={() => {}}
        navigation={EMPTY_NAVIGATION}
        query={query}
        onQueryChange={setQuery}
        placeholder={t("catalog.searchDirectory", {
          kind: t(`catalog.${kind}`),
        })}
      />
    </View>
  ) : null
  const empty = navigation.isLoading ? (
    <ActivityIndicator color={palette.primary} />
  ) : (
    <View style={{ padding: 24, gap: 12 }}>
      <Text style={{ color: palette.textMuted }}>
        {navigation.error
          ? t("bookDetail.loadFailed.title")
          : t("catalog.emptyDirectory")}
      </Text>
      {navigation.error && (
        <Pressable onPress={() => void navigation.refetch()}>
          <Text style={{ color: palette.primary }}>{t("catalog.retry")}</Text>
        </Pressable>
      )}
    </View>
  )
  const columns = resolveLibraryGridColumns(width)
  const cardWidth = resolveLibraryGridCardWidth(width, columns)
  return (
    <View
      collapsable={false}
      style={{ flex: 1, backgroundColor: palette.background }}
    >
      {kind === "series" ? (
        <FlashList
          ref={seriesList}
          ListHeaderComponent={searchField}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          key={viewMode + columns}
          data={facets}
          numColumns={viewMode === "grid" ? columns : 1}
          contentInsetAdjustmentBehavior="automatic"
          keyExtractor={(item) => item.name}
          contentContainerStyle={{
            paddingHorizontal:
              LIBRARY_GRID_PADDING_X - LIBRARY_GRID_CARD_GAP / 2,
            paddingBottom: insets.bottom + 24,
          }}
          ListEmptyComponent={empty}
          renderItem={({ item }) => (
            <SeriesItem
              facet={item}
              width={cardWidth}
              list={viewMode === "list"}
              books={bookMap}
              onPress={() => select({ kind, value: item.name })}
            />
          )}
        />
      ) : (
        <>
          <SectionList
            ListHeaderComponent={searchField}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ref={list}
            sections={sections}
            contentInsetAdjustmentBehavior="automatic"
            stickySectionHeadersEnabled
            keyExtractor={(item) => item.name}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingRight: 40,
              paddingBottom: insets.bottom + 24,
            }}
            getItemLayout={(_, index) => layouts[index]!}
            ListEmptyComponent={empty}
            renderSectionHeader={({ section }) => (
              <View
                style={{
                  height: 32,
                  justifyContent: "center",
                  backgroundColor: palette.background,
                }}
              >
                <Text style={{ color: palette.textMuted, fontWeight: "600" }}>
                  {section.title}
                </Text>
              </View>
            )}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => select({ kind, value: item.name })}
                style={{
                  height: 52,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  borderBottomWidth: 0.5,
                  borderColor: palette.border,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontSize: 17, color: palette.text }}
                >
                  {item.name}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: palette.textMuted,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {item.bookCount}
                </Text>
                <Text style={{ color: palette.textMuted }}>›</Text>
              </Pressable>
            )}
          />
          <View
            style={{
              position: "absolute",
              right: 0,
              top: headerHeight + 8,
              bottom: insets.bottom + 16,
              justifyContent: "center",
            }}
          >
            <AlphabetRail
              onJump={(letter) => {
                const index = sections.findIndex(
                  (section) => section.title === letter,
                )
                if (index >= 0)
                  list.current?.scrollToLocation({
                    sectionIndex: index,
                    itemIndex: 0,
                    animated: false,
                    // The section header only needs an offset for overlapping navigation.
                    viewOffset: Platform.OS === "ios" ? headerHeight : 0,
                  })
              }}
            />
          </View>
        </>
      )}
      <Stack.Screen options={options} />
      {toolbar}
    </View>
  )
}
