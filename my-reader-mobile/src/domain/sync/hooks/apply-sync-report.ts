import type { LibrarySyncReport, SyncTrigger } from "@/src/domain/sync/types"
import { libraryQueryKeys } from "@/src/domain/library/calibre"
import { queryClient } from "@/src/services/query/query-client"
import { replaceDeviceLibrary } from "@/src/services/core/device-registry"
import { useAppStore } from "@/src/store/app-store"

function isPassiveTrigger(trigger?: SyncTrigger): boolean {
  return trigger === "startup" || trigger === "scheduled"
}

/** Applies a domain sync report to Zustand + React Query. */
export function applySyncReport(
  report: LibrarySyncReport,
  context?: { trigger?: SyncTrigger },
): Promise<void> {
  const passive = isPassiveTrigger(context?.trigger)
  const { calibre, libraryId } = report

  useAppStore
    .getState()
    .setLibraries(
      useAppStore
        .getState()
        .libraries.map((library) =>
          library.id === libraryId ? calibre.library : library,
        ),
    )
  const persistRegistry = replaceDeviceLibrary(calibre.library).then(
    (registry) => {
      useAppStore.getState().setLibraries(registry.libraries)
    },
  )

  if (calibre.books && (!passive || calibre.changed)) {
    queryClient.setQueryData(libraryQueryKeys.books(libraryId), calibre.books)
  } else if (!passive && calibre.changed) {
    void queryClient.invalidateQueries({
      queryKey: libraryQueryKeys.books(libraryId),
    })
  }
  return persistRegistry
}

/** Applies multiple library reports from a batch sync run. */
export async function applySyncRunReports(
  results: LibrarySyncReport[],
  context?: { trigger?: SyncTrigger },
): Promise<void> {
  for (const report of results) {
    await applySyncReport(report, context)
  }
}
