import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { mapListRowsToBookItems } from "@/src/domain/library/catalog"
import type { BookItem, Library } from "@/src/domain/types"
import { listLibraryBooksPageByLastRead } from "@/src/services/core/catalog"
import { librarySidecarRootUri } from "@/src/services/fs/library-paths"
import { withLocalLibraryContentRoot } from "@/src/services/fs/local-library-content"
import { queryKeys } from "@/src/services/query/query-keys"

/** Returns books with reading history, ordered from most to least recently read. */
export function useRecentlyReadBooks(
  library: Library | null,
  books: BookItem[],
) {
  const { data = [] } = useQuery({
    queryKey: queryKeys.recentlyReadBooks(library?.id),
    queryFn: async () => {
      if (!library) return []
      return withLocalLibraryContentRoot(library, async (libraryRootUri) => {
        const page = await listLibraryBooksPageByLastRead(
          library,
          libraryRootUri,
          librarySidecarRootUri(library),
          0,
          200,
        )
        return mapListRowsToBookItems(library, page.items)
      })
    },
    enabled: !!library,
    staleTime: 1000 * 60 * 5,
  })

  return useMemo(() => {
    const bookById = new Map(books.map((book) => [book.id, book]))
    return data.map((book) => bookById.get(book.id) ?? book)
  }, [books, data])
}
