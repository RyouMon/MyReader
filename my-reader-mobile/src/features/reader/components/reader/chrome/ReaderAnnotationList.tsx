import EditSquareIcon from "@expo/material-symbols/edit_square.xml"
import { BottomSheetFlatList } from "@expo/ui/community/bottom-sheet"
import type { Locator } from "@my-reader/readium"
import { formatHumanReadableTime } from "@my-reader/tools/human-readable-time"
import {
  type ReaderAnnotationColor,
  readerAnnotationTint,
} from "@my-reader/tools/reader-annotations"
import { compactReaderSearchSnippet } from "@my-reader/tools/reader-search"
import { type MenuAction, MenuView } from "@react-native-menu/menu"
import { memo, useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ActivityIndicator,
  Platform,
  View as RNView,
  StyleSheet,
} from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"

import { EmptyState } from "@/src/components/ui"
import {
  type ReaderChromePalette,
  underlayFromSurface,
} from "@/src/design/reader-chrome-palette"
import { Pressable, Text, View } from "@/tw"
import { ReaderChromeIcon } from "./ReaderChromeIcon"

const ANNOTATION_PREVIEW_TARGET_LENGTH = 38
const ANNOTATION_MIN_CONTEXT_LENGTH = 6

export type ReaderAnnotationItem = {
  id: string
  locator: Locator
  excerpt: string
  note: string | null
  color: ReaderAnnotationColor
  createdAt: number
}

type ReaderAnnotationListProps = {
  annotations: ReaderAnnotationItem[]
  loading: boolean
  pending: boolean
  error: boolean
  palette: ReaderChromePalette
  onRetry: () => void
  onSelect: (item: ReaderAnnotationItem) => void
  onEdit: (item: ReaderAnnotationItem) => void
  onDelete: (
    item: ReaderAnnotationItem,
  ) => boolean | void | Promise<boolean | void>
}

type AnnotationRowProps = Pick<
  ReaderAnnotationListProps,
  "palette" | "onSelect" | "onEdit" | "onDelete"
> & {
  item: ReaderAnnotationItem
  deletionDisabled: boolean
  selectionMode: boolean
  selected: boolean
  onToggleSelection: (id: string) => void
}

function annotationContextLengths(item: ReaderAnnotationItem) {
  const highlight =
    item.locator.text?.highlight?.replace(/\s+/g, " ").trim() ||
    item.excerpt.replace(/\s+/g, " ").trim()
  const contextBudget = Math.max(
    ANNOTATION_MIN_CONTEXT_LENGTH * 2,
    ANNOTATION_PREVIEW_TARGET_LENGTH - Array.from(highlight).length,
  )
  return {
    before: Math.floor(contextBudget / 2),
    after: Math.ceil(contextBudget / 2),
  }
}

const AnnotationRow = memo(function AnnotationRow({
  item,
  palette,
  deletionDisabled,
  selectionMode,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onToggleSelection,
}: AnnotationRowProps) {
  const { i18n, t } = useTranslation()
  const dateLabel = formatHumanReadableTime(
    item.createdAt,
    i18n.resolvedLanguage ?? i18n.language,
  )
  const [rowPressed, setRowPressed] = useState(false)
  const selectionActionTitle = t(
    selected ? "reader.annotations.deselect" : "reader.annotations.select",
  )
  const actions = useMemo<MenuAction[]>(
    () => [
      { id: "select", title: selectionActionTitle },
      {
        id: "edit",
        title: t("reader.annotations.edit"),
        attributes: { disabled: deletionDisabled },
      },
      {
        id: "delete",
        title: t("common.delete"),
        attributes: { destructive: true, disabled: deletionDisabled },
      },
    ],
    [deletionDisabled, selectionActionTitle, t],
  )
  const handleAction = useCallback(
    (action: string) => {
      if (action === "select") {
        onToggleSelection(item.id)
        return
      }
      if (action === "edit" && !deletionDisabled) onEdit(item)
      if (action === "delete" && !deletionDisabled) void onDelete(item)
    },
    [deletionDisabled, item, onDelete, onEdit, onToggleSelection],
  )
  const handlePress = useCallback(() => {
    if (selectionMode) {
      onToggleSelection(item.id)
      return
    }
    onSelect(item)
  }, [item, onSelect, onToggleSelection, selectionMode])
  const handlePressIn = useCallback(() => setRowPressed(true), [])
  const handlePressOut = useCallback(() => setRowPressed(false), [])
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(350)
        .runOnJS(true)
        .onBegin(handlePressIn)
        .onEnd((_event, success) => {
          if (success) handlePress()
        })
        .onFinalize(handlePressOut),
    [handlePress, handlePressIn, handlePressOut],
  )
  const contextLengths = annotationContextLengths(item)
  const snippet = compactReaderSearchSnippet(
    item.locator,
    contextLengths.before,
    contextLengths.after,
  )
  const highlight = snippet.highlight || item.excerpt
  const position = item.locator.locations?.position
  const accessibilityLabel = [
    `${snippet.before}${highlight}${snippet.after}`,
    item.note,
    dateLabel,
    position,
  ]
    .filter(Boolean)
    .join(", ")
  const backgroundColor = selected ? palette.tocRowActive : palette.tocRowIdle
  const pressedBackgroundColor = underlayFromSurface(
    backgroundColor,
    palette.bg,
  )
  const row = (
    <Pressable
      accessibilityRole={selectionMode ? "checkbox" : "button"}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={
        selectionMode ? undefined : t("reader.annotations.longPressHint")
      }
      accessibilityState={{ selected }}
      accessibilityActions={[
        { name: "select", label: selectionActionTitle },
        ...(deletionDisabled
          ? []
          : [
              { name: "edit", label: t("reader.annotations.edit") },
              { name: "delete", label: t("common.delete") },
            ]),
      ]}
      className="mx-3 mb-0.5 rounded-xl"
      style={{
        minHeight: 72,
        backgroundColor: rowPressed ? pressedBackgroundColor : backgroundColor,
      }}
      onAccessibilityAction={({ nativeEvent }) =>
        handleAction(nativeEvent.actionName)
      }
      onPressIn={selectionMode ? handlePressIn : undefined}
      onPressOut={selectionMode ? handlePressOut : undefined}
      onPress={handlePress}
    >
      <View className="flex-1 flex-row items-start px-5 py-2">
        {selectionMode ? (
          <View
            className="mr-3 mt-0.5 h-6 w-6 items-center justify-center rounded-full border"
            style={{
              borderColor: selected ? palette.accentText : palette.textMuted,
              backgroundColor: selected ? palette.accentText : "transparent",
            }}
          >
            {selected ? (
              <ReaderChromeIcon
                name="check"
                size={16}
                color={palette.sheetSurface}
              />
            ) : null}
          </View>
        ) : null}

        <View className="min-w-0 flex-1">
          <View className="flex-row items-start">
            <Text
              className="min-w-0 flex-1 text-base leading-6"
              style={{ color: palette.textMuted }}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {snippet.before}
              <Text
                style={{
                  backgroundColor: `${readerAnnotationTint(item.color)}66`,
                  color: palette.text,
                  fontWeight: "600",
                }}
              >
                {highlight}
              </Text>
              {snippet.after}
            </Text>
            {position != null ? (
              <Text
                className="ml-3 text-base leading-6"
                style={{ color: palette.textMuted }}
              >
                {position}
              </Text>
            ) : null}
          </View>
          {item.note ? (
            <Text
              className="mt-0.5 text-base font-semibold"
              style={{ color: palette.text }}
              numberOfLines={2}
            >
              {item.note}
            </Text>
          ) : null}
          {dateLabel ? (
            <Text
              className="mt-0.5 text-sm"
              style={{ color: palette.textMuted }}
              numberOfLines={1}
            >
              {dateLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  )

  if (selectionMode) return row

  return (
    <GestureDetector gesture={tapGesture}>
      <MenuView
        actions={actions}
        shouldOpenOnLongPress
        isAnchoredToRight={Platform.OS === "android"}
        onPressAction={({ nativeEvent }) => handleAction(nativeEvent.event)}
      >
        {row}
      </MenuView>
    </GestureDetector>
  )
})

export function ReaderAnnotationList({
  annotations,
  loading,
  pending,
  error,
  palette,
  onRetry,
  onSelect,
  onEdit,
  onDelete,
}: ReaderAnnotationListProps) {
  const { t } = useTranslation()
  const [managing, setManaging] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [deletingSelection, setDeletingSelection] = useState(false)
  const selectedAnnotations = useMemo(
    () => annotations.filter((item) => selectedIds.has(item.id)),
    [annotations, selectedIds],
  )
  const mutationDisabled = pending || deletingSelection
  const deletionDisabled = mutationDisabled || selectedAnnotations.length === 0

  const toggleSelection = useCallback((id: string) => {
    setManaging(true)
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const toggleManagement = useCallback(() => {
    setManaging((current) => !current)
    setSelectedIds(new Set())
  }, [])
  const deleteSelected = useCallback(async () => {
    if (deletionDisabled) return
    setDeletingSelection(true)
    try {
      for (const item of selectedAnnotations) {
        const removed = await onDelete(item)
        if (removed === false) return
      }
      setManaging(false)
      setSelectedIds(new Set())
    } catch {
      // The annotation query exposes the mutation error and retry action.
    } finally {
      setDeletingSelection(false)
    }
  }, [deletionDisabled, onDelete, selectedAnnotations])
  const renderItem = useCallback(
    ({ item }: { item: ReaderAnnotationItem }) => (
      <AnnotationRow
        item={item}
        palette={palette}
        deletionDisabled={mutationDisabled}
        selectionMode={managing}
        selected={selectedIds.has(item.id)}
        onSelect={onSelect}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleSelection={toggleSelection}
      />
    ),
    [
      managing,
      mutationDisabled,
      onDelete,
      onEdit,
      onSelect,
      palette,
      selectedIds,
      toggleSelection,
    ],
  )

  if (loading) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t("reader.annotations.loading")}
        className="items-center gap-3 px-5 py-12"
      >
        <ActivityIndicator color={palette.accentText} />
        <Text className="text-base" style={{ color: palette.textMuted }}>
          {t("reader.annotations.loading")}
        </Text>
      </View>
    )
  }

  if (error) {
    return (
      <View className="items-center gap-4 px-5 py-12">
        <Text
          accessibilityRole="alert"
          className="text-center text-base"
          style={{ color: palette.textMuted }}
        >
          {t("reader.annotations.error")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("reader.annotations.retry")}
          className="min-h-11 items-center justify-center rounded-md px-4"
          style={{ backgroundColor: palette.segmentActive }}
          onPress={onRetry}
        >
          <Text
            className="text-base font-semibold"
            style={{ color: palette.accentText }}
          >
            {t("reader.annotations.retry")}
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <RNView testID="reader-annotations-content" style={styles.content}>
      <BottomSheetFlatList<ReaderAnnotationItem>
        data={annotations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          annotations.length === 0 ? styles.emptyListContent : undefined
        }
        ListEmptyComponent={
          <EmptyState
            title={t("reader.empty.annotations.title")}
            detail={t("reader.empty.annotations.detail")}
            icon={{ ios: "square.and.pencil", android: EditSquareIcon }}
            layout="container"
            colors={{
              icon: palette.textFaint,
              title: palette.text,
              detail: palette.textMuted,
            }}
          />
        }
      />

      {annotations.length > 0 ? (
        <View
          className="flex-row items-center px-5 py-2"
          style={{
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: palette.border,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              managing
                ? "reader.annotations.done"
                : "reader.annotations.manage",
            )}
            accessibilityState={{ disabled: mutationDisabled }}
            className="h-11 w-11 items-center justify-center rounded-md"
            hitSlop={2}
            disabled={mutationDisabled}
            onPress={toggleManagement}
          >
            <ReaderChromeIcon
              name={managing ? "check" : "manage"}
              size={24}
              color={mutationDisabled ? palette.textFaint : palette.accentText}
            />
          </Pressable>
          {managing ? (
            <Text
              className="flex-1 text-center text-base font-semibold"
              style={{ color: palette.textMuted }}
            >
              {t("reader.annotations.selectedCount", {
                count: selectedAnnotations.length,
              })}
            </Text>
          ) : (
            <View className="flex-1" />
          )}
          {managing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("reader.annotations.deleteSelected")}
              accessibilityState={{ disabled: deletionDisabled }}
              className="h-11 w-11 items-center justify-center rounded-md"
              hitSlop={2}
              disabled={deletionDisabled}
              onPress={() => void deleteSelected()}
            >
              <ReaderChromeIcon
                name="delete"
                size={24}
                color={
                  deletionDisabled ? palette.textFaint : palette.accentText
                }
              />
            </Pressable>
          ) : (
            <View className="h-11 w-11" />
          )}
        </View>
      ) : null}
    </RNView>
  )
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  emptyListContent: { flexGrow: 1 },
  list: { flex: 1 },
})
