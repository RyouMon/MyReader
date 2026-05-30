import { useCallback } from "react";

import { useAppStore } from "../store/app-store";

import { deleteFileEverywhere, evictLocalFile, openSyncContext } from "../domain/sync/actions";
import { runSync, type SyncDeps, type SyncRunReport, type SyncTrigger } from "../domain/sync/scheduler";
import { getBooksForLibrary } from "../features/library/hooks/useLibraryQuery";

export type SyncActions = {
  triggerSync: (trigger?: SyncTrigger) => Promise<SyncRunReport>;
  deleteRemote: (libraryId: string, relativePath: string) => Promise<void>;
  evictLocal: (libraryId: string, relativePath: string) => Promise<void>;
  deleteEverywhere: (libraryId: string, relativePath: string) => Promise<void>;
};

export function useSyncActions(): SyncActions {
  const libraries = useAppStore((s) => s.libraries);
  const dataSources = useAppStore((s) => s.dataSources);

  const triggerSync = useCallback(
    (trigger: SyncTrigger = "manual") => {
      const snapshot = useAppStore.getState();
      const deps: SyncDeps = {
        libraries: snapshot.libraries,
        dataSources: snapshot.dataSources,
        syncEnabled: snapshot.settings.syncEnabled,
        getBooksForLibrary,
      };
      return runSync(trigger, deps);
    },
    [],
  );

  const deleteRemote = useCallback(
    async (libraryId: string, relativePath: string) => {
      const library = libraries.find((l) => l.id === libraryId);
      if (!library) return;
      const ctx = await openSyncContext(library, dataSources);
      await deleteFileEverywhere(ctx, relativePath);
    },
    [libraries, dataSources],
  );

  const evictLocal = useCallback(
    async (libraryId: string, relativePath: string) => {
      const library = libraries.find((l) => l.id === libraryId);
      if (!library) return;
      const ctx = await openSyncContext(library, dataSources);
      await evictLocalFile(ctx, relativePath);
    },
    [libraries, dataSources],
  );

  const deleteEverywhere = useCallback(
    async (libraryId: string, relativePath: string) => {
      const library = libraries.find((l) => l.id === libraryId);
      if (!library) return;
      const ctx = await openSyncContext(library, dataSources);
      await deleteFileEverywhere(ctx, relativePath);
    },
    [libraries, dataSources],
  );

  return { triggerSync, deleteRemote, evictLocal, deleteEverywhere };
}