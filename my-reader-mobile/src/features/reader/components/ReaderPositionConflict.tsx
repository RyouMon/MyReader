import {
  BottomSheetModal,
  BottomSheetScrollView,
} from "@expo/ui/community/bottom-sheet"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import type { useReaderPositionConflict } from "@/src/hooks/use-reader-position-conflict"
import { Pressable, Text, View } from "@/tw"

export function ReaderPositionConflict({
  conflict,
  visible,
  insetsTop,
  palette,
  onSelect,
}: {
  conflict: ReturnType<typeof useReaderPositionConflict>
  visible: boolean
  insetsTop: number
  palette: ReaderChromePalette
  onSelect: (operationId: string) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const sheetRef = useRef<BottomSheetModal>(null)
  const hasConflict = conflict.candidates.length > 1 || Boolean(conflict.error)
  useEffect(() => {
    if (!hasConflict && !conflict.pending) sheetRef.current?.dismiss()
  }, [hasConflict, conflict.pending])

  return (
    <>
      {hasConflict && visible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("reader.positionConflictTitle")}
          className="absolute self-center rounded-full px-4 py-3"
          style={{ top: insetsTop + 48, backgroundColor: palette.sheetSurface }}
          onPress={() => {
            sheetRef.current?.present()
            void conflict.refresh()
          }}
        >
          <Text className="text-sm font-medium" style={{ color: palette.text }}>
            {t("reader.positionConflictTitle")}
          </Text>
        </Pressable>
      ) : null}
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={["50%", "80%"]}
        enableDynamicSizing={false}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: palette.sheetSurface }}
      >
        <BottomSheetScrollView contentContainerStyle={{ padding: 20 }}>
          <Text
            accessibilityRole="header"
            className="text-lg font-semibold"
            style={{ color: palette.text }}
          >
            {t("reader.positionConflictTitle")}
          </Text>
          <Text className="mt-2 text-sm" style={{ color: palette.textMuted }}>
            {t("reader.positionConflictDescription")}
          </Text>
          <View className="mt-4 gap-2">
            {conflict.candidates.map((candidate) => (
              <Pressable
                key={candidate.operationId}
                accessibilityRole="button"
                accessibilityState={{ disabled: conflict.pending }}
                disabled={conflict.pending}
                className="rounded-xl px-4 py-3"
                style={{ backgroundColor: palette.tocRowIdle }}
                onPress={() => void onSelect(candidate.operationId)}
              >
                <Text
                  className="text-base font-medium"
                  style={{ color: palette.text }}
                >
                  {candidate.displayProgression === null
                    ? t("reader.positionConflictUnknownProgress")
                    : `${Math.round(candidate.displayProgression * 100)}%`}
                </Text>
                <Text
                  className="mt-1 text-sm"
                  style={{ color: palette.textMuted }}
                >
                  {new Date(candidate.recordedAt).toLocaleString(
                    i18n.resolvedLanguage ?? i18n.language,
                  )}
                  {" · "}
                  {candidate.replicaId.slice(0, 8)}
                </Text>
              </Pressable>
            ))}
          </View>
          {conflict.error ? (
            <View className="mt-3 gap-2">
              <Text accessibilityRole="alert" style={{ color: palette.text }}>
                {conflict.error}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={conflict.pending}
                className="py-3"
                onPress={() => void conflict.refresh()}
              >
                <Text style={{ color: palette.text }}>
                  {t("errorBoundary.retry")}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            className="mt-3 items-center py-3"
            onPress={() => sheetRef.current?.dismiss()}
          >
            <Text
              className="text-sm font-medium"
              style={{ color: palette.textMuted }}
            >
              {t("common.cancel")}
            </Text>
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  )
}
