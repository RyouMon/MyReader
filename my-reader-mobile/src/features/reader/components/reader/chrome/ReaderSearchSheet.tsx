import {
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from "@expo/ui/community/bottom-sheet"
import {
  compactReaderSearchSnippet,
  resolveReaderSearchResultMetadata,
} from "@my-reader/tools/reader-search"
import type { ReaderLocator, ReaderTocItem } from "@my-reader/tools/reader-toc"
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  StyleSheet,
  View as RNView,
} from "react-native"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"

import {
  type ReaderChromePalette,
  underlayFromSurface,
} from "@/src/design/reader-chrome-palette"
import { EmptyState } from "@/src/components/ui"
import type { ReaderSearchStatus } from "@/src/features/reader/hooks/use-reader-search"
import { Pressable, Text, TouchableHighlight, View } from "@/tw"
import { ReaderChromeIcon } from "./ReaderChromeIcon"
import {
  READER_EXPANDED_ACTION_RADIUS,
  READER_TOC_SHEET_INITIAL_INDEX,
  READER_TOC_SHEET_SNAP_POINTS,
} from "./readerChromeConstants"

export type ReaderSearchSheetProps = {
  status: ReaderSearchStatus
  query: string
  locators: ReaderLocator[]
  toc: ReaderTocItem[]
  positions: ReaderLocator[]
  resultCount?: number
  done: boolean
  hasMore: boolean
  loadingMore: boolean
  loadMoreError: boolean
  selectedLocator?: ReaderLocator | null
  palette: ReaderChromePalette
  onSearch: (query: string) => void
  onClear: () => void
  onLoadMore: () => void | Promise<void>
  onSelectResult: (locator: ReaderLocator) => void
  onDismiss: () => void
}

const RESULT_ROW_HEIGHT = 112
const RESULTS_HEADER_HEIGHT = 56
const SEARCH_EMPTY_ICON = {
  ios: "magnifyingglass",
  android: "search",
}
const SEARCH_ERROR_ICON = {
  ios: "exclamationmark.triangle",
  android: "error-outline",
}

type SearchResultRowProps = {
  locator: ReaderLocator
  toc: ReaderTocItem[]
  positions: ReaderLocator[]
  fallbackTitle: string
  selected: boolean
  palette: ReaderChromePalette
  onSelect: (locator: ReaderLocator) => void
}

const SearchResultRow = memo(function SearchResultRow({
  locator,
  toc,
  positions,
  fallbackTitle,
  selected,
  palette,
  onSelect,
}: SearchResultRowProps) {
  const { t } = useTranslation()
  const metadata = resolveReaderSearchResultMetadata({
    locator,
    toc,
    positions,
    fallbackTitle,
  })
  const title = metadata.title ?? fallbackTitle
  const position = metadata.position
  const { before, highlight, after } = compactReaderSearchSnippet(locator)
  const hasSnippet = Boolean(before || highlight || after)
  const positionLabel =
    typeof position === "number"
      ? t("reader.search.position", { position })
      : ""
  const accessibilityLabel = [
    title,
    `${before}${highlight}${after}`,
    positionLabel,
  ]
    .filter(Boolean)
    .join(", ")
  const handlePress = useCallback(() => onSelect(locator), [locator, onSelect])

  return (
    <TouchableHighlight
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      underlayColor={underlayFromSurface(
        selected ? palette.tocRowActive : palette.tocRowIdle,
        palette.bg,
      )}
      style={[
        styles.resultRow,
        {
          backgroundColor: selected
            ? palette.tocRowActive
            : palette.sheetSurface,
          borderBottomColor: palette.border,
        },
      ]}
      onPress={handlePress}
    >
      <View style={styles.resultContent}>
        <View style={styles.resultHeading}>
          <Text
            className="text-base font-semibold leading-6"
            style={[styles.resultTitle, { color: palette.text }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            accessible={false}
            className="text-right text-base leading-6"
            style={[styles.resultPosition, { color: palette.textMuted }]}
          >
            {position ?? ""}
          </Text>
        </View>
        <Text
          className="text-base leading-6"
          style={[styles.resultPreview, { color: palette.textMuted }]}
          numberOfLines={2}
        >
          {hasSnippet ? (
            <>
              {before}
              <Text
                style={{
                  color: palette.accentText,
                  fontWeight: "700",
                }}
              >
                {highlight}
              </Text>
              {after}
            </>
          ) : (
            t("reader.search.noExcerpt")
          )}
        </Text>
      </View>
    </TouchableHighlight>
  )
})

function readerSearchResultKey(locator: ReaderLocator, index: number): string {
  const locations = locator.locations
  const rangeStart = locations?.domRange?.start
  return [
    "reader-search",
    index,
    locator.href,
    locations?.fragments?.join(",") ?? "",
    locations?.cssSelector ?? rangeStart?.cssSelector ?? "",
    rangeStart?.textNodeIndex ?? "",
    rangeStart?.charOffset ?? rangeStart?.offset ?? "",
    locations?.progression ?? "",
    locator.text?.highlight ?? "",
  ].join(":")
}

function getReaderSearchResultLayout(
  _data: ArrayLike<ReaderLocator> | null | undefined,
  index: number,
) {
  return {
    length: RESULT_ROW_HEIGHT,
    offset: RESULTS_HEADER_HEIGHT + RESULT_ROW_HEIGHT * index,
    index,
  }
}

const SearchResultsFooter = memo(function SearchResultsFooter({
  loading,
  error,
  palette,
}: {
  loading: boolean
  error: boolean
  palette: ReaderChromePalette
}) {
  const { t } = useTranslation()
  return (
    <View style={styles.resultsFooter}>
      {loading ? (
        <ActivityIndicator
          accessibilityLabel={t("reader.search.loadingMore")}
          color={palette.accentText}
        />
      ) : error ? (
        <Text className="text-sm" style={{ color: palette.textMuted }}>
          {t("reader.search.loadMoreFailed")}
        </Text>
      ) : null}
    </View>
  )
})

const ReaderSearchSheet = forwardRef<BottomSheetModal, ReaderSearchSheetProps>(
  function ReaderSearchSheet(
    {
      status,
      query,
      locators,
      toc,
      positions,
      resultCount,
      done,
      hasMore,
      loadingMore,
      loadMoreError,
      selectedLocator,
      palette,
      onSearch,
      onClear,
      onLoadMore,
      onSelectResult,
      onDismiss,
    },
    ref,
  ) {
    const { t } = useTranslation()
    const [draft, setDraft] = useState(() => ({ query, value: query }))
    const listHeightRef = useRef(0)
    const contentHeightRef = useRef(0)
    const draftQuery = draft.query === query ? draft.value : query
    const canSubmit = draftQuery.trim().length > 0
    const fallbackTitle = t("reader.search.resultTitle")
    const emptyStateColors = {
      icon: palette.textFaint,
      title: palette.text,
      detail: palette.textMuted,
    }
    const setDraftQuery = useCallback(
      (value: string) => setDraft({ query, value }),
      [query],
    )

    const submitSearch = useCallback(() => {
      if (!canSubmit) return
      onSearch(draftQuery)
    }, [canSubmit, draftQuery, onSearch])
    const handleDismiss = useCallback(() => {
      setDraftQuery(query)
      onDismiss()
    }, [onDismiss, query, setDraftQuery])
    const handleClear = useCallback(() => {
      setDraftQuery("")
      onClear()
    }, [onClear, setDraftQuery])
    const loadNextPage = useCallback(() => {
      if (!hasMore || loadingMore || loadMoreError) return
      void onLoadMore()
    }, [hasMore, loadMoreError, loadingMore, onLoadMore])
    const handleEndReached = useCallback(() => {
      if (!hasMore || loadingMore) return
      void onLoadMore()
    }, [hasMore, loadingMore, onLoadMore])
    const fillVisibleResults = useCallback(() => {
      if (
        listHeightRef.current > 0 &&
        contentHeightRef.current <= listHeightRef.current + 1
      ) {
        loadNextPage()
      }
    }, [loadNextPage])
    const handleListLayout = useCallback(
      (event: LayoutChangeEvent) => {
        listHeightRef.current = event.nativeEvent.layout.height
        fillVisibleResults()
      },
      [fillVisibleResults],
    )
    const handleContentSizeChange = useCallback(
      (_width: number, height: number) => {
        contentHeightRef.current = height
        fillVisibleResults()
      },
      [fillVisibleResults],
    )

    useEffect(() => {
      fillVisibleResults()
    }, [fillVisibleResults, locators.length])

    const renderItem = useCallback(
      ({ item }: ListRenderItemInfo<ReaderLocator>) => (
        <SearchResultRow
          locator={item}
          toc={toc}
          positions={positions}
          fallbackTitle={fallbackTitle}
          selected={item === selectedLocator}
          palette={palette}
          onSelect={onSelectResult}
        />
      ),
      [fallbackTitle, onSelectResult, palette, positions, selectedLocator, toc],
    )

    return (
      <BottomSheetModal
        ref={ref}
        index={READER_TOC_SHEET_INITIAL_INDEX}
        snapPoints={READER_TOC_SHEET_SNAP_POINTS}
        enableDynamicSizing={false}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: palette.sheetSurface }}
        onDismiss={handleDismiss}
      >
        <SafeAreaProvider style={styles.sheet}>
          <SafeAreaView
            edges={["bottom"]}
            style={[styles.sheet, styles.sheetSafeArea]}
          >
            <RNView style={styles.titleBar}>
              <Text
                accessibilityRole="header"
                className="text-lg font-semibold"
                style={{ color: palette.text }}
              >
                {t("reader.search.title")}
              </Text>
            </RNView>

            {status === "idle" ? (
              <RNView style={styles.body}>
                <EmptyState
                  title={t("reader.search.promptTitle")}
                  detail={t("reader.search.prompt")}
                  icon={SEARCH_EMPTY_ICON}
                  layout="container"
                  colors={emptyStateColors}
                />
              </RNView>
            ) : status === "searching" ? (
              <RNView style={styles.body}>
                <SearchLoading palette={palette} />
              </RNView>
            ) : status === "error" ? (
              <RNView style={styles.body}>
                <EmptyState
                  title={t("reader.search.error")}
                  detail={t("reader.search.errorDetail")}
                  icon={SEARCH_ERROR_ICON}
                  layout="container"
                  colors={emptyStateColors}
                  action={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("reader.search.retry")}
                      className="min-h-11 items-center justify-center rounded-md px-4"
                      style={{ backgroundColor: palette.segmentActive }}
                      onPress={() => onSearch(query)}
                    >
                      <Text
                        className="text-base font-semibold"
                        style={{ color: palette.accentText }}
                      >
                        {t("reader.search.retry")}
                      </Text>
                    </Pressable>
                  }
                />
              </RNView>
            ) : status === "empty" ? (
              <RNView style={styles.body}>
                <EmptyState
                  title={t("reader.search.empty", { query })}
                  detail={t("reader.search.emptyDetail")}
                  icon={SEARCH_EMPTY_ICON}
                  layout="container"
                  colors={emptyStateColors}
                />
              </RNView>
            ) : (
              <BottomSheetFlatList<ReaderLocator>
                testID="reader-search-results"
                data={locators}
                extraData={selectedLocator}
                keyExtractor={readerSearchResultKey}
                getItemLayout={getReaderSearchResultLayout}
                renderItem={renderItem}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                style={styles.body}
                onLayout={handleListLayout}
                onContentSizeChange={handleContentSizeChange}
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.4}
                ListHeaderComponent={
                  <View style={styles.resultsHeader}>
                    <Text
                      className="text-sm"
                      style={{ color: palette.textMuted }}
                    >
                      {!done || resultCount == null
                        ? t("reader.search.loadedCount", {
                            count: locators.length,
                          })
                        : t("reader.search.resultCount", {
                            count: resultCount,
                          })}
                    </Text>
                  </View>
                }
                ListFooterComponent={
                  <SearchResultsFooter
                    loading={loadingMore}
                    error={loadMoreError}
                    palette={palette}
                  />
                }
              />
            )}

            <RNView
              testID="reader-search-dock"
              style={[
                styles.searchDock,
                {
                  borderTopColor: palette.border,
                },
              ]}
            >
              <RNView
                style={[
                  styles.searchField,
                  {
                    backgroundColor: palette.segmentIdle,
                    borderColor: palette.border,
                  },
                ]}
              >
                <ReaderChromeIcon
                  name="search"
                  size={20}
                  color={palette.textMuted}
                />
                <BottomSheetTextInput
                  accessibilityLabel={t("reader.search.inputLabel")}
                  value={draftQuery}
                  placeholder={t("reader.search.placeholder")}
                  placeholderTextColor={palette.textFaint}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                  selectionColor={palette.accentText}
                  style={[styles.searchInput, { color: palette.text }]}
                  onChangeText={setDraftQuery}
                  onSubmitEditing={submitSearch}
                />
                {draftQuery || query ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("reader.search.clear")}
                    className="h-11 w-11 items-center justify-center rounded-md"
                    onPress={handleClear}
                  >
                    <ReaderChromeIcon
                      name="close"
                      size={18}
                      color={palette.textMuted}
                    />
                  </Pressable>
                ) : null}
              </RNView>
            </RNView>
          </SafeAreaView>
        </SafeAreaProvider>
      </BottomSheetModal>
    )
  },
)

function SearchLoading({ palette }: { palette: ReaderChromePalette }) {
  const { t } = useTranslation()
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t("reader.search.searching")}
      style={styles.searchLoading}
    >
      <ActivityIndicator color={palette.accentText} />
      <Text className="text-base" style={{ color: palette.textMuted }}>
        {t("reader.search.searching")}
      </Text>
    </View>
  )
}

export default ReaderSearchSheet

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  sheetSafeArea: {
    paddingBottom: 16,
  },
  titleBar: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
  },
  body: {
    flex: 1,
  },
  resultRow: {
    height: RESULT_ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  resultHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  resultTitle: {
    flex: 1,
    minWidth: 0,
    height: 24,
  },
  resultPosition: {
    width: 48,
    height: 24,
    marginLeft: 12,
  },
  resultPreview: {
    height: 48,
    marginTop: 4,
  },
  resultsFooter: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  resultsHeader: {
    height: RESULTS_HEADER_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  searchLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 20,
  },
  searchDock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchField: {
    minHeight: 48,
    paddingLeft: 14,
    paddingRight: 2,
    borderRadius: READER_EXPANDED_ACTION_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontSize: 16,
  },
})
