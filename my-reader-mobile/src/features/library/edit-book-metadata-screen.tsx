import { libraryTypeOf, type Library } from "@my-reader/tools/types/library"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { EmptyState, FormLabeledFieldRow, Screen } from "@/src/components"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { useThemePalette } from "@/src/design/tokens"
import { updateManagedBookMetadata } from "@/src/domain/library/hooks/library-actions"
import type { BookItem } from "@/src/domain/types"
import { useBooks } from "@/src/features/library/hooks/useLibraryQuery"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { createSaveAction } from "@/src/navigation/toolbar-action-helpers"
import { useAppStore } from "@/src/store/app-store"
import { TextInput, View } from "@/tw"

function parseAuthors(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((author) => author.trim())
    .filter(Boolean)
}

export default function EditBookMetadataScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const activeLibraryId = useAppStore((state) => state.activeLibraryId)
  const libraries = useAppStore((state) => state.libraries)
  const library = useMemo(
    () =>
      libraries.find((candidate) => candidate.id === activeLibraryId) ?? null,
    [activeLibraryId, libraries],
  )
  const { data: books = [] } = useBooks(activeLibraryId)
  const book = books.find((candidate) => candidate.id === id) ?? null

  if (!library || libraryTypeOf(library) !== "myreader" || !book) {
    return <UnavailableEditBookScreen />
  }

  return <EditBookMetadataForm book={book} library={library} />
}

function UnavailableEditBookScreen() {
  const { t } = useTranslation()
  const { options, toolbar } = useScreenHeader({
    title: t("bookEdit.title"),
    close: {},
  })

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <Screen>
        <EmptyState
          title={t("bookEdit.unavailable.title")}
          detail={t("bookEdit.unavailable.detail")}
          icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }}
        />
      </Screen>
    </>
  )
}

function EditBookMetadataForm({
  book,
  library,
}: {
  book: BookItem
  library: Library
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const [title, setTitle] = useState(book.title)
  const [authors, setAuthors] = useState(
    (book.authors ?? [book.author]).filter(Boolean).join(", "),
  )
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const bookId = Number(book.id)
    const normalizedTitle = title.trim()
    const normalizedAuthors = parseAuthors(authors)
    if (!Number.isFinite(bookId) || bookId <= 0) {
      return
    }
    if (!normalizedTitle || normalizedAuthors.length === 0) {
      showAlertWithStatusBarRestore(
        t("bookEdit.incomplete.title"),
        t("bookEdit.incomplete.detail"),
      )
      return
    }

    setSaving(true)
    try {
      await updateManagedBookMetadata(library, {
        bookId,
        title: normalizedTitle,
        authors: normalizedAuthors,
      })
      router.dismiss()
    } catch (error) {
      showAlertWithStatusBarRestore(
        t("bookEdit.saveFailed"),
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      setSaving(false)
    }
  }

  const { options, toolbar } = useScreenHeader({
    title: t("bookEdit.title"),
    close: {},
    right: [
      createSaveAction({
        label: saving ? t("bookEdit.saving") : t("bookEdit.save"),
        loading: saving,
        color: palette.primary,
        onPress: () => void handleSave(),
      }),
    ],
  })

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <Screen>
        <View
          className="gap-3 rounded-3xl px-4 py-4"
          style={{
            backgroundColor: palette.surface,
            borderColor: palette.border,
            borderWidth: 1,
          }}
        >
          <FormLabeledFieldRow label={t("bookEdit.bookTitle")} required>
            <TextInput
              testID="book-edit-title"
              accessibilityLabel={t("bookEdit.bookTitle")}
              value={title}
              onChangeText={setTitle}
              placeholder={t("bookEdit.bookTitle")}
              placeholderTextColor={palette.textMuted}
              className="min-h-10 border-0 bg-transparent py-1 text-base"
              style={{ color: palette.text }}
            />
          </FormLabeledFieldRow>
          <FormLabeledFieldRow label={t("bookEdit.authors")} required>
            <TextInput
              testID="book-edit-authors"
              accessibilityLabel={t("bookEdit.authors")}
              value={authors}
              onChangeText={setAuthors}
              placeholder={t("bookEdit.authorsPlaceholder")}
              placeholderTextColor={palette.textMuted}
              autoCorrect={false}
              className="min-h-10 border-0 bg-transparent py-1 text-base"
              style={{ color: palette.text }}
            />
          </FormLabeledFieldRow>
        </View>
      </Screen>
    </>
  )
}
