import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/tauri-api"

export const pendingBookUploadKeys = {
  all: ["pendingBookUploads"] as const,
  list: (libraryId: string | null | undefined) =>
    [...pendingBookUploadKeys.all, libraryId ?? ""] as const,
}

export function usePendingBookUploads(
  libraryId: string | null | undefined,
  enabled = true,
) {
  return useQuery<string[], Error>({
    queryKey: pendingBookUploadKeys.list(libraryId),
    queryFn: () => (libraryId ? api.listPendingBookUploads(libraryId) : []),
    enabled: Boolean(libraryId && enabled),
  })
}
