import {
  isFacetKind,
  parseCatalogTokens,
  type CatalogFacetKind,
  type CatalogToken,
} from "@my-reader/tools/catalog-navigation"
import {
  isBuiltInBookCollectionId,
  type BuiltInBookCollectionId,
} from "@my-reader/tools/types/book-collection"
import type { LibrarySortOption } from "@/types/libraryUi"

export type CatalogLocation = {
  directory?: CatalogFacetKind
  tokens?: CatalogToken[]
  query?: string
  collection?: BuiltInBookCollectionId
  sort?: LibrarySortOption
}

export function parseCatalogLocation(
  value: unknown,
): CatalogLocation | undefined {
  if (!value || typeof value !== "object") return undefined
  const v = value as Record<string, unknown>
  return {
    directory: isFacetKind(v.directory) ? v.directory : undefined,
    tokens: parseCatalogTokens(v.tokens),
    query: typeof v.query === "string" ? v.query : "",
    collection: isBuiltInBookCollectionId(v.collection) ? v.collection : "all",
    sort:
      v.sort === "title" || v.sort === "author" || v.sort === "progress"
        ? v.sort
        : "recent",
  }
}
