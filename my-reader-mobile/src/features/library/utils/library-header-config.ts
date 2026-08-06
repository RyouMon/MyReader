import type { MobileTranslationKey } from "@my-reader/i18n/mobile"
import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"

import type { SortOption } from "@/src/features/library/hooks/use-books-for-collection"
import type { LibraryViewMode } from "@/src/store/app-store.types"

const standardLibrarySortOptions: {
  value: SortOption
  labelKey: MobileTranslationKey
}[] = [
  { value: "title", labelKey: "library.sort.title" },
  { value: "author", labelKey: "library.sort.author" },
  { value: "recentlyAdded", labelKey: "library.sort.recentlyAdded" },
]

const recentlyReadSortOption = {
  value: "recentlyRead" as const,
  labelKey: "library.sort.recentlyRead" as const,
}

export function getLibrarySortOptions(collectionId: BuiltInBookCollectionId) {
  return collectionId === "recentlyRead"
    ? [recentlyReadSortOption, ...standardLibrarySortOptions]
    : standardLibrarySortOptions
}

export const libraryViewOptions: {
  value: LibraryViewMode
  labelKey: MobileTranslationKey
}[] = [
  { value: "grid", labelKey: "library.view.grid" },
  { value: "list", labelKey: "library.view.list" },
]
