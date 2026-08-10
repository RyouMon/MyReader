import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { type Library, libraryTypeOf } from "@my-reader/tools/types/library"
import { SymbolView } from "expo-symbols"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Platform, StyleSheet } from "react-native"

import { EmptyState, ListRow } from "@/src/components"
import { ENTITY_LIST_ROW_ICONS } from "@/src/components/ui/entity-list-row-icons"
import { LIBRARY_EMPTY_STATE_ICON } from "@/src/components/ui/library-empty-state-icon"
import { useThemePalette } from "@/src/design/tokens"
import { switchActiveLibrary } from "@/src/domain/library/hooks/library-actions"
import { useAppStore } from "@/src/store/app-store"
import { View } from "@/tw"

type LibrarySwitcherListProps = {
  onDismiss: () => void
}

function ActiveLibraryIndicator() {
  const palette = useThemePalette()

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Platform.OS === "ios" ? (
        <SymbolView
          name="checkmark"
          size={17}
          weight="semibold"
          tintColor={palette.primary}
        />
      ) : (
        <MaterialIcons name="check" size={22} color={palette.primary} />
      )}
    </View>
  )
}

export function LibrarySwitcherList({ onDismiss }: LibrarySwitcherListProps) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const libraries = useAppStore((state) => state.libraries)
  const activeLibraryId = useAppStore((state) => state.activeLibraryId)

  const handleSelectLibrary = useCallback(
    (libraryId: string) => {
      onDismiss()
      if (libraryId !== activeLibraryId) {
        void switchActiveLibrary(libraryId)
      }
    },
    [activeLibraryId, onDismiss],
  )

  if (libraries.length === 0) {
    return (
      <EmptyState
        title={t("addLibraryFlow.noLibrary.title")}
        detail={t("addLibraryFlow.noLibrary.description")}
        icon={LIBRARY_EMPTY_STATE_ICON}
        layout="container"
      />
    )
  }

  const renderLibrary = (item: Library, index: number) => {
    const bookCountLabel = t("library.collections.bookCount", {
      count: item.bookCount,
    })
    const isActive = item.id === activeLibraryId
    const libraryType = libraryTypeOf(item)
    const libraryTypeLabel = t(
      libraryType === "myreader"
        ? "libraryDetail.myreaderLibrary"
        : "libraryDetail.calibreLibrary",
    )

    return (
      <ListRow
        key={item.id}
        title={item.name}
        label={`${item.name}, ${libraryTypeLabel}, ${bookCountLabel}${isActive ? `, ${t("settings.currentInUse")}` : ""}`}
        detail={bookCountLabel}
        icon={
          ENTITY_LIST_ROW_ICONS[
            libraryType === "myreader" ? "myreaderLibrary" : "calibreLibrary"
          ]
        }
        accessory={isActive ? <ActiveLibraryIndicator /> : undefined}
        isLast={index === libraries.length - 1}
        onPress={() => handleSelectLibrary(item.id)}
        testID={`library-switcher-library-${item.id}`}
      />
    )
  }

  return (
    <View
      style={[
        styles.libraryList,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      {libraries.map(renderLibrary)}
    </View>
  )
}

const styles = StyleSheet.create({
  libraryList: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
})
