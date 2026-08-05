import { libraryTypeOf } from "@my-reader/tools/types/library"
import type { LibrarySyncReport, SyncTrigger } from "@/src/domain/sync/types"
import { libraryQueryKeys } from "@/src/domain/library/catalog"
import { invalidateFileStates } from "@/src/services/query/invalidate-table"
import { queryClient } from "@/src/services/query/query-client"
import { useAppStore } from "@/src/store/app-store"

function isPassiveTrigger(trigger?: SyncTrigger): boolean {
  return trigger === "startup" || trigger === "scheduled"
}

function hasPulledManagedCatalog(report: LibrarySyncReport): boolean {
  return (
    libraryTypeOf(report.calibre.library) === "myreader" &&
    (report.myreader.providers["library-sidecar"]?.pulled ?? 0) > 0
  )
}

/** Applies a domain sync report to Zustand + React Query. */
export async function applySyncReport(
  report: LibrarySyncReport,
  context?: { trigger?: SyncTrigger },
): Promise<void> {
  const passive = isPassiveTrigger(context?.trigger)
  const { calibre, libraryId } = report
  const pulledManagedCatalog = hasPulledManagedCatalog(report)

  useAppStore
    .getState()
    .setLibraries(
      useAppStore
        .getState()
        .libraries.map((library) =>
          library.id === libraryId ? calibre.library : library,
        ),
    )

  if (calibre.books && (!passive || calibre.changed || pulledManagedCatalog)) {
    queryClient.setQueryData(libraryQueryKeys.books(libraryId), calibre.books)
  } else if (calibre.changed || pulledManagedCatalog) {
    await queryClient.invalidateQueries({
      queryKey: libraryQueryKeys.books(libraryId),
    })
  }

  if (!report.myreader.skipped) {
    await invalidateFileStates(libraryId)
  }
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
