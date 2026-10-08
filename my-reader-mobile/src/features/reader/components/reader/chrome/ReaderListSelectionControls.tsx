import { useTranslation } from "react-i18next"
import { StyleSheet } from "react-native"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { Pressable, Text, View } from "@/tw"
import { ReaderChromeIcon } from "./ReaderChromeIcon"

const LABELS = {
  annotations: {
    done: "reader.annotations.done",
    manage: "reader.annotations.manage",
    selectedCount: "reader.annotations.selectedCount",
    deleteSelected: "reader.annotations.deleteSelected",
  },
  bookmarks: {
    done: "reader.bookmarks.done",
    manage: "reader.bookmarks.manage",
    selectedCount: "reader.bookmarks.selectedCount",
    deleteSelected: "reader.bookmarks.deleteSelected",
  },
} as const

export function ReaderListManagementBar({
  kind,
  palette,
  managing,
  mutationDisabled,
  deletionDisabled,
  selectedCount,
  toggleManagement,
  deleteSelected,
}: {
  kind: keyof typeof LABELS
  palette: ReaderChromePalette
  managing: boolean
  mutationDisabled: boolean
  deletionDisabled: boolean
  selectedCount: number
  toggleManagement: () => void
  deleteSelected: () => Promise<void>
}) {
  const { t } = useTranslation()
  const labels = LABELS[kind]
  return (
    <View
      className="flex-row items-center px-5 py-2"
      style={{
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(managing ? labels.done : labels.manage)}
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
          {t(labels.selectedCount, {
            count: selectedCount,
          })}
        </Text>
      ) : (
        <View className="flex-1" />
      )}
      {managing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(labels.deleteSelected)}
          accessibilityState={{ disabled: deletionDisabled }}
          className="h-11 w-11 items-center justify-center rounded-md"
          hitSlop={2}
          disabled={deletionDisabled}
          onPress={() => void deleteSelected()}
        >
          <ReaderChromeIcon
            name="delete"
            size={24}
            color={deletionDisabled ? palette.textFaint : palette.accentText}
          />
        </Pressable>
      ) : (
        <View className="h-11 w-11" />
      )}
    </View>
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
