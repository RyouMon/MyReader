import { BottomSheetTextInput } from "@expo/ui/community/bottom-sheet"
import {
  READER_ANNOTATION_COLORS,
  type ReaderAnnotationColor,
} from "@my-reader/tools/reader-annotations"
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { Alert, StyleSheet, type TextInput } from "react-native"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { useThemePalette } from "@/src/design/tokens"
import { Pressable, Text, View } from "@/tw"
import ReaderAnnotationEditorActions from "./ReaderAnnotationEditorActions"
import ReaderAnnotationEditorSheetContainer from "./ReaderAnnotationEditorSheetContainer"
import type { ReaderAnnotationEditorSheetRef } from "./ReaderAnnotationEditorSheetContainer.types"

const COLORS = Object.keys(READER_ANNOTATION_COLORS) as ReaderAnnotationColor[]

export type ReaderAnnotationEditorDraft = {
  key: string
  excerpt: string
  color: ReaderAnnotationColor
  note: string | null
  createdAt: number
  existing: boolean
}

type ReaderAnnotationEditorSheetProps = {
  draft: ReaderAnnotationEditorDraft | null
  pending: boolean
  palette: ReaderChromePalette
  onSave: (color: ReaderAnnotationColor, note: string) => Promise<boolean>
  onDelete?: () => Promise<boolean>
  onDismiss: () => void
}

export const ReaderAnnotationEditorSheet = forwardRef<
  ReaderAnnotationEditorSheetRef,
  ReaderAnnotationEditorSheetProps
>(function ReaderAnnotationEditorSheet(
  { draft, pending, palette, onSave, onDelete, onDismiss },
  ref,
) {
  const { i18n, t } = useTranslation()
  const themePalette = useThemePalette()
  const inputRef = useRef<TextInput>(null)
  const [color, setColor] = useState<ReaderAnnotationColor>("yellow")
  const [note, setNote] = useState("")
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!draft) return
    setColor(draft.color)
    setNote(draft.note ?? "")
    setEditing(false)
  }, [draft])

  const timeLabel = useMemo(() => {
    if (!draft) return ""
    return new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(draft.createdAt)
  }, [draft, i18n.language, i18n.resolvedLanguage])

  const beginEditing = useCallback(() => {
    if (pending) return
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [pending])

  const confirmDelete = useCallback(() => {
    if (!onDelete || pending) return
    Alert.alert(
      t("reader.annotations.deleteTitle"),
      t("reader.annotations.deleteMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => void onDelete(),
        },
      ],
    )
  }, [onDelete, pending, t])

  return (
    <ReaderAnnotationEditorSheetContainer
      ref={ref}
      backgroundColor={palette.sheetSurface}
      pending={pending}
      onDismiss={onDismiss}
    >
      <View className="flex-1 px-5 pb-24">
        <View className="flex-row items-center">
          <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
            <Text
              accessibilityRole="header"
              className="text-xl font-semibold"
              style={{ color: palette.text }}
            >
              {t("reader.annotations.title")}
            </Text>
            <Text className="text-base" style={{ color: palette.textFaint }}>
              {timeLabel}
            </Text>
          </View>
        </View>

        <View
          className="mt-5 py-1 pl-4"
          style={{
            borderLeftColor: READER_ANNOTATION_COLORS[color],
            borderLeftWidth: 4,
          }}
        >
          <Text
            className="text-base leading-6"
            style={{ color: palette.text }}
            numberOfLines={4}
          >
            {draft?.excerpt ?? ""}
          </Text>
        </View>

        <Text
          className="mb-2 mt-6 text-sm font-semibold"
          style={{ color: palette.textMuted }}
        >
          {t("reader.annotations.color")}
        </Text>
        <View className="flex-row gap-2">
          {COLORS.map((option) => {
            const selected = option === color
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={t(`reader.annotations.colors.${option}`)}
                accessibilityState={{ disabled: pending, selected }}
                className="h-11 w-11 items-center justify-center rounded-full border-2"
                style={{
                  borderColor: selected ? palette.text : "transparent",
                }}
                disabled={pending}
                onPress={() => setColor(option)}
              >
                <View
                  className="h-7 w-7 rounded-full"
                  style={{
                    backgroundColor: READER_ANNOTATION_COLORS[option],
                  }}
                />
              </Pressable>
            )
          })}
        </View>

        <View className="mt-6 flex-1">
          {editing ? (
            <BottomSheetTextInput
              ref={inputRef}
              accessibilityLabel={t("reader.annotations.note")}
              multiline
              maxLength={4000}
              selectionColor={palette.accentText}
              style={[styles.noteInput, { color: palette.text }]}
              value={note}
              onChangeText={setNote}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("reader.annotations.note")}
              accessibilityHint={t("reader.annotations.editNoteHint")}
              className="min-h-[240px] flex-1"
              disabled={pending}
              onPress={beginEditing}
            >
              {note ? (
                <Text
                  className="text-base leading-6"
                  style={{ color: palette.text }}
                >
                  {note}
                </Text>
              ) : null}
            </Pressable>
          )}
        </View>

        <ReaderAnnotationEditorActions
          deleteColor={themePalette.danger}
          deleteLabel={t("common.delete")}
          deleteSurfaceColor={themePalette.dangerSoft}
          pending={pending}
          saveColor={palette.accent}
          saveContentColor={palette.bg}
          saveDisabled={draft === null}
          saveLabel={t("common.save")}
          showDelete={draft?.existing === true && onDelete !== undefined}
          onDelete={confirmDelete}
          onSave={() => void onSave(color, note)}
        />
      </View>
    </ReaderAnnotationEditorSheetContainer>
  )
})

export type { ReaderAnnotationEditorSheetRef }

const styles = StyleSheet.create({
  noteInput: {
    minHeight: 240,
    padding: 0,
    textAlignVertical: "top",
    fontSize: 16,
    lineHeight: 24,
  },
})
