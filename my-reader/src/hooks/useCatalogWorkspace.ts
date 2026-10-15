import { useMemo } from "react"
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router"
import {
  EMPTY_NAVIGATION,
  type CatalogToken,
} from "@my-reader/tools/catalog-navigation"
import {
  parseCatalogLocation,
  type CatalogLocation,
} from "@/lib/catalogLocation"
import { errorMessage } from "@/lib/error-presentation"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import { useCatalogNavigation } from "./queries/useCatalogNavigation"

const EMPTY_TOKENS: CatalogToken[] = []

export function useCatalogWorkspace(libraryId: string | null) {
  const location = useLocation()
  const navigate = useNavigate()
  const router = useRouter()
  const stored = useLibraryUiStore()
  const catalog = useMemo(
    () => parseCatalogLocation(location.search.catalog),
    [location.search.catalog],
  )
  const tokens = catalog?.tokens ?? EMPTY_TOKENS
  const directory = catalog?.directory
  const collectionId = catalog?.collection ?? stored.activeCollectionId
  const searchQuery = catalog?.query ?? stored.librarySearchQuery
  const sortBy = catalog?.sort ?? stored.librarySortBy
  const navigation = useCatalogNavigation(libraryId)

  function update(patch: CatalogLocation) {
    void navigate({
      to: "/",
      replace: true,
      search: {
        catalog: {
          collection: collectionId,
          tokens,
          query: searchQuery,
          sort: sortBy,
          directory,
          ...patch,
        },
      },
    })
  }
  const setSearchQuery = (query: string) =>
    catalog ? update({ query }) : stored.setLibrarySearchQuery(query)
  const setSortBy = (sort: typeof sortBy) =>
    catalog ? update({ sort }) : stored.setLibrarySortBy(sort)
  const browseFacet = (token: CatalogToken) =>
    navigate({
      to: "/",
      search: {
        catalog: {
          tokens: [token],
          collection: "all",
          query: "",
          sort: "title",
        },
      },
    })
  const back = () => {
    if (router.history.canGoBack()) router.history.back()
    else void navigate({ to: "/", search: {} })
  }
  return {
    catalog,
    tokens,
    directory,
    collectionId,
    searchQuery,
    sortBy,
    setSearchQuery,
    setSortBy,
    browseFacet,
    back,
    onBack: catalog ? back : undefined,
    setTokens: (next: CatalogToken[], query = searchQuery) =>
      update({ tokens: next, query, directory: undefined }),
    emptySearch: searchQuery || (tokens.length ? " " : ""),
    scrollKey: JSON.stringify([
      libraryId,
      collectionId,
      tokens,
      searchQuery,
      sortBy,
      directory,
    ]),
    navigation: {
      ...navigation,
      data: navigation.data ?? EMPTY_NAVIGATION,
      error: navigation.error ? errorMessage(navigation.error) : null,
    },
  }
}
