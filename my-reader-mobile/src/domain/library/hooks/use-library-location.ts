import { useQuery } from "@tanstack/react-query"
import type { Library } from "@my-reader/tools/types/library"
import { readLibraryLocation } from "@/src/services/core/library-location"
import { useAppStore } from "@/src/store/app-store"

export function useLibraryLocation(library: Library | null, diagnose = true) {
  const source = useAppStore((state) =>
    state.dataSources.find((item) => item.id === library?.dataSourceId),
  )
  return useQuery({
    queryKey: [
      "libraryLocation",
      library?.id,
      library?.sourcePath,
      library?.path,
      diagnose,
    ],
    queryFn: () => readLibraryLocation(library!, source, diagnose),
    enabled: !!library,
    retry: false,
  })
}
