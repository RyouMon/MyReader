import { useCallback, useMemo } from "react";

import type { Library } from "../data/types";
import { AppInvariantError } from "../errors";
import { useAppStore } from "../store/app-store";

import type { FileStateRow } from "../data/file_state";
import {
  deleteFileEverywhere,
  downloadFile,
  downloadFileDirect,
  evictLocalFileOfflineSafe,
  listBackedFiles,
  openSyncContext,
  reconcileFileStates,
} from "./actions";

import i18n from "@/src/i18n";

export type SyncTargetInfo = {
  libraryId: string;
  libraryName: string;
  dataSourceId: string;
  backendKind: "webdav" | "local-direct";
  isLocalDirect: boolean;
  summary: string;
};

export type SyncActions = {
  getTargetInfo: (libraryId: string) => Promise<SyncTargetInfo>;
  testBackend: (libraryId: string) => Promise<void>;
  downloadFile: (libraryId: string, relativePath: string) => Promise<void>;
  downloadFileDirect: (libraryId: string, relativePath: string) => Promise<void>;
  evictLocal: (libraryId: string, relativePath: string) => Promise<void>;
  deleteEverywhere: (libraryId: string, relativePath: string) => Promise<void>;
  listFileStates: (libraryId: string, filter?: string) => Promise<FileStateRow[]>;
  reconcile: (libraryId: string) => Promise<FileStateRow[]>;
};

/**
 * Mobile counterpart of the desktop `useSyncActions` hook.
 *
 * Every method resolves the library + data sources through the app store and
 * opens a fresh `SyncContext` for the call so that stale manifests never leak
 * between actions (cost is dominated by network round-trip, not the JSON load).
 */
export function useSyncActions(): SyncActions {
  const libraries = useAppStore((state) => state.libraries);
  const dataSources = useAppStore((state) => state.dataSources);

  const findLibrary = useCallback(
    (libraryId: string): Library => {
      const library = libraries.find((item) => item.id === libraryId);
      if (!library) throw new AppInvariantError(i18n.t("sync.libraryNotFound", { id: libraryId }));
      return library;
    },
    [libraries],
  );

  return useMemo<SyncActions>(
    () => ({
      async getTargetInfo(libraryId) {
        const library = findLibrary(libraryId);
        const ctx = await openSyncContext(library, dataSources);
        const summary = ctx.isLocalDirect
          ? i18n.t("sync.localDirectLabel", { path: library.sourcePath ?? library.path ?? library.id })
          : `WebDAV · ${ctx.dataSourceId}`;
        return {
          libraryId,
          libraryName: library.name,
          dataSourceId: ctx.dataSourceId,
          backendKind: ctx.backend.kind,
          isLocalDirect: ctx.isLocalDirect,
          summary,
        };
      },
      async testBackend(libraryId) {
        const ctx = await openSyncContext(findLibrary(libraryId), dataSources);
        await ctx.backend.statRemote(".");
      },
      async downloadFile(libraryId, relativePath) {
        const ctx = await openSyncContext(findLibrary(libraryId), dataSources);
        await downloadFile(ctx, relativePath);
      },
      async downloadFileDirect(libraryId, relativePath) {
        const ctx = await openSyncContext(findLibrary(libraryId), dataSources);
        await downloadFileDirect(ctx, relativePath);
      },
      async evictLocal(libraryId, relativePath) {
        const library = findLibrary(libraryId);
        await evictLocalFileOfflineSafe(library, relativePath);
      },
      async deleteEverywhere(libraryId, relativePath) {
        const ctx = await openSyncContext(findLibrary(libraryId), dataSources);
        await deleteFileEverywhere(ctx, relativePath);
      },
      async listFileStates(libraryId, filter) {
        const ctx = await openSyncContext(findLibrary(libraryId), dataSources);
        await reconcileFileStates(ctx);
        return await listBackedFiles(ctx, filter);
      },
      async reconcile(libraryId) {
        const ctx = await openSyncContext(findLibrary(libraryId), dataSources);
        return await reconcileFileStates(ctx);
      },
    }),
    [dataSources, findLibrary],
  );
}
