import CloudOffIcon from "@expo/material-symbols/cloud_off.xml"
import DownloadIcon from "@expo/material-symbols/download.xml"
import HistoryIcon from "@expo/material-symbols/history.xml"
import StarIcon from "@expo/material-symbols/star.xml"
import type { MobileTranslationKey } from "@my-reader/i18n/mobile"
import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"

import Book2Icon from "@/assets/icons/book_2.xml"
import type { ListRowIcon } from "@/src/components"

export type BookCollectionDefinition = {
  id: BuiltInBookCollectionId
  titleKey: MobileTranslationKey
  icon: ListRowIcon
}

export const PRIMARY_BOOK_COLLECTIONS: BookCollectionDefinition[] = [
  {
    id: "all",
    titleKey: "library.collections.all",
    icon: {
      ios: "book.closed",
      android: "book_2",
      androidSource: Book2Icon,
    },
  },
  {
    id: "recentlyRead",
    titleKey: "library.collections.recentlyRead",
    icon: {
      ios: "clock.arrow.circlepath",
      android: "history",
      androidSource: HistoryIcon,
    },
  },
  {
    id: "favorites",
    titleKey: "library.collections.favorites",
    icon: { ios: "star", android: "star", androidSource: StarIcon },
  },
  {
    id: "downloaded",
    titleKey: "library.collections.downloaded",
    icon: {
      ios: "arrow.down.circle",
      android: "download",
      androidSource: DownloadIcon,
    },
  },
]

export const STORAGE_BOOK_COLLECTIONS: BookCollectionDefinition[] = [
  {
    id: "localOnly",
    titleKey: "library.collections.localOnly",
    icon: {
      ios: "icloud.slash",
      android: "cloud_off",
      androidSource: CloudOffIcon,
    },
  },
]

const BOOK_COLLECTION_BY_ID = new Map(
  [...PRIMARY_BOOK_COLLECTIONS, ...STORAGE_BOOK_COLLECTIONS].map(
    (collection) => [collection.id, collection],
  ),
)

export function getBookCollectionDefinition(
  collectionId: BuiltInBookCollectionId,
): BookCollectionDefinition {
  return BOOK_COLLECTION_BY_ID.get(collectionId) ?? PRIMARY_BOOK_COLLECTIONS[0]!
}
