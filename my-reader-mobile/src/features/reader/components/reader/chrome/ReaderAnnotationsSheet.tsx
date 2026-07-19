import { BottomSheetModal } from "@expo/ui/community/bottom-sheet"
import { forwardRef, useCallback } from "react"
import { useTranslation } from "react-i18next"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { Text, View } from "@/tw"
import {
  type ReaderAnnotationItem,
  ReaderAnnotationList,
} from "./ReaderAnnotationList"
import {
  READER_TOC_SHEET_INITIAL_INDEX,
  READER_TOC_SHEET_SNAP_POINTS,
} from "./readerChromeConstants"

export type ReaderAnnotationsSheetProps = {
  annotations: ReaderAnnotationItem[]
  loading: boolean
  pending: boolean
  error: boolean
  palette: ReaderChromePalette
  onRetry: () => void
  onSelect: (item: ReaderAnnotationItem) => void
  onEdit: (item: ReaderAnnotationItem) => void
  onDelete: (item: ReaderAnnotationItem) => void
  onDismiss: () => void
}

const ReaderAnnotationsSheet = forwardRef<
  BottomSheetModal,
  ReaderAnnotationsSheetProps
>(function ReaderAnnotationsSheet(
  {
    annotations,
    loading,
    pending,
    error,
    palette,
    onRetry,
    onSelect,
    onEdit,
    onDelete,
    onDismiss,
  },
  ref,
) {
  const { t } = useTranslation()
  const handleDismiss = useCallback(() => onDismiss(), [onDismiss])

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
      <View className="min-h-12 justify-center px-5 pb-2">
        <Text
          accessibilityRole="header"
          className="text-lg font-semibold"
          style={{ color: palette.text }}
        >
          {t("reader.annotations.title")}
        </Text>
      </View>
      <ReaderAnnotationList
        annotations={annotations}
        loading={loading}
        pending={pending}
        error={error}
        palette={palette}
        onRetry={onRetry}
        onSelect={onSelect}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </BottomSheetModal>
  )
})

export default ReaderAnnotationsSheet
