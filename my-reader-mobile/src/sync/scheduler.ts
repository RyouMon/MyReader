import { useSyncExternalStore } from "react";

import { useAppStore } from "../store/app-store";
import { isLocalDirect } from "./resolve";
import { isRemoteSourceType } from "../data/types";

import {
  listBackedFiles,
  openSyncContext,
  reconcileFileStates,
  type SyncTargetContext,
} from "./actions";
import { syncDbFromContext } from "./db_sync";
import { mirrorMissingCovers } from "../domain/library/cover-mirror";
import { libraryQueryKeys } from "../hooks/queries/useLibraryQuery";
import { queryClient } from "../hooks/queries/queryClient";
import type { BookItem } from "../data/types";
import i18n from "@/src/i18n";

export type SyncTrigger = "startup" | "foreground" | "manual";

export type LibrarySyncResult = {
  libraryId: string;
  libraryName: string;
  isLocalDirect: boolean;
  skipped: boolean;
  skipReason?: string;
  reconciledCount?: number;
  dbPushed?: number;
  dbPulled?: number;
  error?: string;
};

export type SyncRunReport = {
  trigger: SyncTrigger;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  results: LibrarySyncResult[];
  aborted?: boolean;
};

export type SchedulerStatus = {
  running: boolean;
  lastTrigger: SyncTrigger | null;
  lastFinishedAt: number | null;
  lastReport: SyncRunReport | null;
};

type Listener = () => void;

const MIN_AUTO_INTERVAL_MS = 30_000;

let state: SchedulerStatus = {
  running: false,
  lastTrigger: null,
  lastFinishedAt: null,
  lastReport: null,
};

let inflight: Promise<SyncRunReport> | null = null;
const listeners = new Set<Listener>();

function setState(patch: Partial<SchedulerStatus>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getStatus(): SchedulerStatus {
  return state;
}

/**
 * Public scheduler entry point. Coalesces concurrent triggers into one run and
 * enforces a minimum interval for automatic triggers (startup/foreground) so
 * that rapid lifecycle ping-pong doesn't hammer the backend.
 */
export function runSync(trigger: SyncTrigger): Promise<SyncRunReport> {
  if (inflight) return inflight;

  const now = Date.now();
  const sinceLast = state.lastFinishedAt ? now - state.lastFinishedAt : Infinity;
  if (trigger !== "manual" && sinceLast < MIN_AUTO_INTERVAL_MS) {
    const skipped: SyncRunReport = {
      trigger,
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      results: [],
      aborted: true,
    };
    return Promise.resolve(skipped);
  }

  const syncEnabled = useAppStore.getState().settings.syncEnabled;
  if (!syncEnabled && trigger !== "manual") {
    const skipped: SyncRunReport = {
      trigger,
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      results: [],
      aborted: true,
    };
    return Promise.resolve(skipped);
  }

  inflight = (async () => {
    setState({ running: true, lastTrigger: trigger });
    const startedAt = Date.now();
    const results: LibrarySyncResult[] = [];
    const snapshot = useAppStore.getState();
    const libraries = snapshot.libraries;
    const dataSources = snapshot.dataSources;

    for (const library of libraries) {
      const entry: LibrarySyncResult = {
        libraryId: library.id,
        libraryName: library.name,
        isLocalDirect: !isRemoteSourceType(library.sourceType),
        skipped: false,
      };
      try {
        let ctx: SyncTargetContext;
        try {
          ctx = await openSyncContext(library, dataSources);
        } catch (err) {
          entry.skipped = true;
          entry.skipReason = describeError(err);
          results.push(entry);
          continue;
        }

        if (isLocalDirect(ctx.backend)) {
          entry.skipped = true;
          entry.skipReason = i18n.t("sync.localDirectRead");
          results.push(entry);
          continue;
        }

        await reconcileFileStates(ctx);
        const rows = await listBackedFiles(ctx);
        entry.reconciledCount = rows.length;

        const dbResult = await syncDbFromContext(library, ctx);
        entry.dbPushed = dbResult.pushed;
        entry.dbPulled = dbResult.pulled;

        if (isRemoteSourceType(library.sourceType)) {
          const books = queryClient.getQueryData<BookItem[]>(libraryQueryKeys.books(library.id)) ?? [];
          void mirrorMissingCovers(library, dataSources, books).catch(() => {});
        }
      } catch (err) {
        entry.error = describeError(err);
      }
      results.push(entry);
    }

    const finishedAt = Date.now();
    const report: SyncRunReport = {
      trigger,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      results,
    };

    setState({ running: false, lastFinishedAt: finishedAt, lastReport: report });
    return report;
  })();

  try {
    return inflight;
  } finally {
    void inflight.finally(() => {
      inflight = null;
    });
  }
}

/**
 * Hook for UI components that need to reflect scheduler activity (progress
 * indicator, last-run timestamp). Uses the external-store pattern so React
 * sees state updates without each component having to wire subscriptions.
 */
export function useSyncSchedulerStatus(): SchedulerStatus {
  return useSyncExternalStore(subscribe, getStatus, getStatus);
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
