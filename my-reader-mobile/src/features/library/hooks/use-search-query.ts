import { useEffect, useState, useCallback } from "react"

import { useDebouncedValue } from "@/src/hooks/use-debounced-value"

export function useSearchQuery(libraryId?: string) {
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebouncedValue(query, 180)

  const clearQuery = useCallback(() => {
    setQuery("")
  }, [])

  // Clear search when switching libraries
  useEffect(() => {
    setQuery("")
  }, [libraryId])

  return { query, setQuery, debouncedQuery, clearQuery }
}
