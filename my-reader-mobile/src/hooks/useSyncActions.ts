import { useCallback } from "react";

import { useAppStore } from "../store/app-store";

import { openSyncContext, evictLocalFile, deleteFileEverywhere, type SyncTargetContext } from "../domain/sync/actions";
import { runSync, type SyncTrigger, type SyncDeps } from "../domain/sync/scheduler";

export type SyncActions = {
  triggerSync: (libraryId: string) => Promise<void>;
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