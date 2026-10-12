import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/tauri-api"
import { readingProgressKeys } from "./useReadingProgressQuery"

export function useReadingPositionCandidates(
  libraryId: string | null,
  bookId: number,
  format: string,
  enabled: boolean,
) {
  const queryKey = [
    ...readingProgressKeys.list(libraryId),
    "positionCandidates",
    bookId,
    format,
  ] as const
  const query = useQuery({
    queryKey,
    networkMode: "always",
    staleTime: 0,
    retry: false,
    enabled: enabled && Boolean(libraryId && format),
    queryFn: () =>
      api.listReadingPositionCandidates(libraryId!, bookId, format),
  })
  return { ...query, queryKey }
}
