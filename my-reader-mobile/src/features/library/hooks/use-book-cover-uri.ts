import { useEffect, useState } from "react"

import type { BookItem, DataSource, Library } from "@/src/domain/types"
import type { BookDetail } from "@my-reader/tools/types/book"
import { resolveCoverForDetail } from "@/src/utils/book-detail"

export function useBookCoverUri(
  activeLibrary: Library,
  detail: BookDetail | null,
  listBook: BookItem | null,
  dataSources: DataSource[],
) {
  const [coverUri, setCoverUri] = useState<BookItem["coverUri"] | undefined>(
    listBook?.coverUri,
  )

  useEffect(() => {
    if (!detail) {
      queueMicrotask(() => setCoverUri(listBook?.coverUri))
      return
    }
    let cancelled = false
    void resolveCoverForDetail(
      activeLibrary,
      detail,
      dataSources,
      listBook?.coverUri,
    ).then((resolved) => {
      if (!cancelled) setCoverUri(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [activeLibrary, detail, listBook?.coverUri, dataSources])

  return { coverUri }
}
