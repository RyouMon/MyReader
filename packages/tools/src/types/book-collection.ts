export const BUILT_IN_BOOK_COLLECTION_IDS = [
  "all",
  "recentlyRead",
  "favorites",
  "downloaded",
  "localOnly",
] as const

export type BuiltInBookCollectionId =
  (typeof BUILT_IN_BOOK_COLLECTION_IDS)[number]

export function isBuiltInBookCollectionId(
  value: unknown,
): value is BuiltInBookCollectionId {
  return BUILT_IN_BOOK_COLLECTION_IDS.includes(value as BuiltInBookCollectionId)
}
