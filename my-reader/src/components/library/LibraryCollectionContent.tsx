import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import { AlertCircle } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import BookGrid, { LibrarySkeletonGrid } from "@/components/library/BookGrid"
import { NoLibraryEmptyState } from "@/components/library/NoLibraryEmptyState"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getDesktopBookCollectionDefinition } from "./bookCollectionDefinitions"
import type { LibraryViewMode } from "@/types/readerUiPreferences"

export function LibraryCollectionContent({
  loading,
  error,
  hasNoLibrary,
  onAddLibrary,
  onRetry,
  emptyState,
  gridProps,
}: {
  loading: boolean
  error: string | null
  hasNoLibrary: boolean
  onAddLibrary: () => void
  onRetry: () => void
  emptyState: ReactNode
  gridProps: ComponentProps<typeof BookGrid> & { viewMode: LibraryViewMode }
}) {
  const { t } = useTranslation()
  if (loading)
    return error ? null : <LibrarySkeletonGrid viewMode={gridProps.viewMode} />
  if (error)
    return (
      <Empty className="min-h-0 flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertCircle className="text-destructive" />
          </EmptyMedia>
          <EmptyTitle>{t("library.loadingFailed")}</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        </EmptyContent>
      </Empty>
    )
  if (hasNoLibrary) return <NoLibraryEmptyState onAddLibrary={onAddLibrary} />
  if (gridProps.total === 0) return emptyState
  if (gridProps.total > 0)
    return (
      <div className="flex min-h-0 flex-1">
        <BookGrid {...gridProps} />
      </div>
    )
  return null
}

export function LibraryCollectionEmpty({
  activeCollectionId,
  searchQuery,
  isManagedLibrary,
  importingBook,
  onImportBook,
  onBrowseAllBooks,
}: {
  activeCollectionId: BuiltInBookCollectionId
  searchQuery: string
  isManagedLibrary: boolean
  importingBook: boolean
  onImportBook: () => Promise<void>
  onBrowseAllBooks: () => void
}) {
  const { t } = useTranslation()
  const collectionDefinition =
    getDesktopBookCollectionDefinition(activeCollectionId)
  const emptyLibraryState = {
    title: t("library.noMatch.empty.title"),
    detail: t(
      isManagedLibrary
        ? "library.noMatch.empty.myreaderDetail"
        : "library.noMatch.empty.calibreDetail",
    ),
  }
  const emptyState = (() => {
    if (searchQuery) {
      return {
        title: t("library.noMatch.search.title"),
        detail: t("library.noMatch.search.detail"),
      }
    }

    if (activeCollectionId === "all") {
      return emptyLibraryState
    }

    switch (activeCollectionId) {
      case "recentlyRead":
        return {
          title: t("library.noMatch.recentlyRead.title"),
          detail: t("library.noMatch.recentlyRead.detail"),
        }
      case "favorites":
        return {
          title: t("library.noMatch.favorites.title"),
          detail: t("library.noMatch.favorites.detail"),
        }
      case "downloaded":
        return {
          title: t("library.noMatch.downloaded.title"),
          detail: t("library.noMatch.downloaded.detail"),
        }
      case "downloading":
        return {
          title: t("library.noMatch.downloading.title"),
          detail: t("library.noMatch.downloading.detail"),
        }
      case "uploading":
        return {
          title: t("library.noMatch.uploading.title"),
          detail: t("library.noMatch.uploading.detail"),
        }
      case "localOnly":
        return {
          title: t("library.noMatch.localOnly.title"),
          detail: t("library.noMatch.localOnly.detail"),
        }
      default:
        return emptyLibraryState
    }
  })()
  const showsEmptyLibraryState = !searchQuery && activeCollectionId === "all"
  const showsBrowseAllBooksAction =
    !searchQuery &&
    !showsEmptyLibraryState &&
    activeCollectionId !== "localOnly"
  const EmptyCollectionIcon = showsEmptyLibraryState
    ? getDesktopBookCollectionDefinition("all").icon
    : collectionDefinition.icon

  return (
    <Empty className="min-h-0 flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <EmptyCollectionIcon />
        </EmptyMedia>
        <EmptyTitle>{emptyState.title}</EmptyTitle>
        <EmptyDescription>{emptyState.detail}</EmptyDescription>
      </EmptyHeader>
      {isManagedLibrary && showsEmptyLibraryState ? (
        <EmptyContent>
          <Button
            size="sm"
            disabled={importingBook}
            onClick={() => void onImportBook()}
          >
            {importingBook
              ? t("library.importingBook")
              : t("library.empty.importBook")}
          </Button>
        </EmptyContent>
      ) : showsBrowseAllBooksAction ? (
        <EmptyContent>
          <Button size="sm" onClick={onBrowseAllBooks}>
            {t("library.browseAllBooks")}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
