import { type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { IconButton } from "@/src/components/ui/button"
import {
  readerFormColors,
  type ReaderChromePalette,
} from "@/src/design/reader-chrome-palette"
import { Text, View } from "@/tw"
import { ReaderChromeIcon } from "./ReaderChromeIcon"
import { ReaderSheetFooter } from "./ReaderSheetPage"

const LABELS = {
  readingPlan: {
    manage: "narration.plan.select",
    selectedCount: "narration.selected",
    deleteSelected: "narration.plan.clearSelected",
  },
  annotations: {
    manage: "reader.annotations.manage",
    selectedCount: "reader.annotations.selectedCount",
    deleteSelected: "reader.annotations.deleteSelected",
  },
  bookmarks: {
    manage: "reader.bookmarks.manage",
    selectedCount: "reader.bookmarks.selectedCount",
    deleteSelected: "reader.bookmarks.deleteSelected",
  },
  characters: {
    manage: "narration.select",
    selectedCount: "narration.selected",
    deleteSelected: "narration.deleteSelected",
  },
} as const

export function ReaderListManagementBar({
  kind,
  palette,
  managing,
  mutationDisabled,
  deletionDisabled,
  selectedCount,
  totalCount,
  toggleManagement,
  toggleAll,
  deleteSelected,
  trailingAction,
}: {
  kind: keyof typeof LABELS
  palette: ReaderChromePalette
  managing: boolean
  mutationDisabled: boolean
  deletionDisabled: boolean
  selectedCount: number
  totalCount: number
  toggleManagement: () => void
  toggleAll: () => void
  deleteSelected: () => void | Promise<void>
  trailingAction?: ReactNode
}) {
  const { t } = useTranslation()
  const labels = LABELS[kind]
  const colors = readerFormColors(palette)
  const allSelected = totalCount > 0 && selectedCount === totalCount
  return (
    <ReaderSheetFooter palette={palette}>
      <View className="flex-row items-center">
        <IconButton
          label={t(managing ? "common.cancel" : labels.manage)}
          icon={
            managing
              ? { ios: "xmark", android: "close" }
              : { ios: "checklist", android: "checklist" }
          }
          colors={colors}
          tone="primary"
          size="sm"
          disabled={mutationDisabled || (!managing && totalCount === 0)}
          onPress={toggleManagement}
        />
        {managing ? (
          <ReaderSelectAllButton
            allSelected={allSelected}
            palette={palette}
            disabled={mutationDisabled || totalCount === 0}
            onPress={toggleAll}
          />
        ) : null}
      </View>
      <View className="flex-1" />
      {managing ? (
        <>
          <Text className="shrink text-sm" style={{ color: palette.textMuted }}>
            {t(labels.selectedCount, { count: selectedCount })}
          </Text>
          <IconButton
            label={t(labels.deleteSelected)}
            icon={{ ios: "trash", android: "delete-outline" }}
            colors={colors}
            tone="danger"
            size="sm"
            disabled={deletionDisabled}
            onPress={() => void deleteSelected()}
          />
        </>
      ) : (
        trailingAction
      )}
    </ReaderSheetFooter>
  )
}

export function ReaderSelectAllButton({
  allSelected,
  disabled,
  palette,
  onPress,
}: {
  allSelected: boolean
  disabled: boolean
  palette: ReaderChromePalette
  onPress: () => void
}) {
  const { t } = useTranslation()
  return (
    <IconButton
      label={t(allSelected ? "common.deselectAll" : "common.selectAll")}
      icon={
        allSelected
          ? { ios: "checklist.unchecked", android: "remove-done" }
          : { ios: "checklist.checked", android: "done-all" }
      }
      colors={readerFormColors(palette)}
      tone="primary"
      size="sm"
      disabled={disabled}
      onPress={onPress}
    />
  )
}

export function ReaderListSelectionIndicator({
  selected,
  palette,
  className,
}: {
  selected: boolean
  palette: ReaderChromePalette
  className: string
}) {
  return (
    <View
      className={className}
      style={{
        borderColor: selected ? palette.accentText : palette.textMuted,
        backgroundColor: selected ? palette.accentText : "transparent",
      }}
    >
      {selected ? (
        <ReaderChromeIcon name="check" size={16} color={palette.sheetSurface} />
      ) : null}
    </View>
  )
}
