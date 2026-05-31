import { useMutation, useMutationState } from "@tanstack/react-query";

import type { LibrarySyncReport } from "@/src/domain/sync";

import { runLibrarySync } from "./run-library-sync";

const librarySyncMutationKey = ["library", "sync"] as const;

/** Global pending state for manual library sync (shared across all hook instances). */
export function useIsLibrarySyncing(): boolean {
  return (
    useMutationState({
      filters: { mutationKey: librarySyncMutationKey, status: "pending" },
    }).length > 0
  );
}

/** Manual library sync for feature screens (loading state + syncNow). */
export function useSyncLibrary() {
  const mutation = useMutation({
    mutationKey: librarySyncMutationKey,
    mutationFn: (libraryId: string) => runLibrarySync({ libraryId, trigger: "manual" }),
  });
  const isSyncing = useIsLibrarySyncing();

  return {
    syncNow: (libraryId: string) => mutation.mutateAsync(libraryId),
    isSyncing,
  };
}

export { librarySyncMutationKey };

export type { LibrarySyncReport };
