import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/tauri-api"

export const localOnlyBookKeys = {
  all: ["localOnlyBooks"] as const,
  status: (libraryId: string | null | undefined) =>
    [...localOnlyBookKeys.all, libraryId ?? ""] as const,
}

export function useHasLocalOnlyBooks(
  libraryId: string | null | undefined,
  enabled = true,
) {
  return useQuery<boolean, Error>({
    queryKey: localOnlyBookKeys.status(libraryId),
    queryFn: () => (libraryId ? api.hasLocalOnlyBooks(libraryId) : false),
    enabled: Boolean(libraryId && enabled),
  })
}
