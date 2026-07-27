import { useQuery } from "@tanstack/react-query"

import type { Library } from "@/src/domain/types"
import {
  listFileStates,
  type FileState as FileStateRow,
} from "@/src/services/core/content"
import { queryKeys } from "@/src/services/query/query-keys"

export function useFileStates(library: Library | null) {
  return useQuery<FileStateRow[]>({
    queryKey: queryKeys.fileStates(library?.id),
    queryFn: async () => {
      if (!library) return []
      return listFileStates(library)
    },
    enabled: !!library,
    staleTime: 0,
  })
}
