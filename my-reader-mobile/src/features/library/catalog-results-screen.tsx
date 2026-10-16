import { useCallback, useMemo } from "react"
import { router, useLocalSearchParams } from "expo-router"
import { parseCatalogTokens } from "@my-reader/tools/catalog-navigation"
import LibraryScreen from "./library-screen"

export default function CatalogResultsScreen() {
  const { tokens, libraryId, search } = useLocalSearchParams<{
    tokens?: string
    libraryId?: string
    search?: string
  }>()
  const initialTokens = useMemo(() => parseCatalogTokens(tokens), [tokens])
  const handleSearchClose = useCallback(
    () => router.setParams({ search: undefined }),
    [],
  )
  return (
    <LibraryScreen
      collectionId="all"
      initialTokens={initialTokens}
      libraryId={libraryId}
      initialSearchOpen={search === "1"}
      onSearchClose={handleSearchClose}
    />
  )
}
