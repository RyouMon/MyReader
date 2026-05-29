import { useEffect, useSyncExternalStore } from "react";

import type { DataSource, Library } from "../types";
import { SyncConfigError } from "../../errors";
import { notifyDownloadState } from "../../notifications/download-notifications";
import { checkConnectivity } from "../sync/connectivity";
import { downloadContextFile, finalizeRecoveredDownload, openDownloadContextForLibrary } from "./download-service";
import { resolveSyncTarget, isRemoteBackend } from "../sync/resolve";
import { useAppStore } from "../../store/app-store";
import {
  cancelNativeDownload,
  completeNativeDownload,
  isNativeCancel,
  recoverNativeDownloads,
  type RecoveredNativeDownload,
} from "../../services/download/native";

import i18n from "@/src/i18n";

async function checkLibraryConnectivity(libraryId: string): Promise<void> {
  const snapshot = useAppStore.getState();
  const { libraries, dataSources } = snapshot;
  const library = libraries.find((l) => l.id === libraryId);
  if (!library) throw new SyncConfigError(i18n.t("sync.libraryNotFound", { id: libraryId }));
  const target = await resolveSyncTarget(library, dataSources);
  if (isRemoteBackend(target.backend)) await checkConnectivity(target.backend);
}

function getStoreLibraries(): Library[] {
  return useAppStore.getState().libraries;
}

function getStoreDataSources(): DataSource[] {
  return useAppStore.getState().dataSources;
}

export type DownloadTaskStatus =
  | "queued"
  | "starting"
  | "downloading"
  | "done"
  | "error"
  | "cancelled";

export type DownloadTask = {
  readonly id: string;
  readonly libraryId: string;
  readonly bookId?: string;
  readonly format?: string;
  readonly relativePath: string;
  readonly label: string;
  status: DownloadTaskStatus;
  progress: number;
  error: string | null;
};

export type EnqueueOptions = {
  libraryId: string;
  bookId?: string;
  format?: string;
  relativePath: string;
  label: string;
};

type StoreState = { tasks: DownloadTask[] };
type Listener = () => void;
export type DownloadStatusTask = Pick<
  DownloadTask,
  "id" | "libraryId" | "bookId" | "format" | "relativePath" | "status" | "error"
>;
type DownloadTaskMetadata = {
  source: "myreader";
  libraryId: string;
  bookId?: string;
  format?: string;
  relativePath: string;
  label: string;
};

const MAX_CONCURRENT = 2;
const DOWNLOAD_PROGRESS_MIN_INTERVAL_MS = 500;
const DOWNLOAD_PROGRESS_MIN_DELTA = 0.01;

let state: StoreState = { tasks: [] };
let statusSnapshotKey = "";
let statusSnapshot: DownloadStatusTask[] = [];
let initializedExistingTasks = false;
let initializingExistingTasks: Promise<void> | null = null;
const nativeStopHandlers = new Map<string, () => void>();
const finalizingRecoveredTasks = new Map<string, Promise<void>>();
const finalizedRecoveredTaskIds = new Set<string>();
const alertedErrorTaskIds = new Set<string>();
const notifiedDoneTaskIds = new Set<string>();
const notifiedErrorTaskIds = new Set<string>();
const lastProgressNotifications = new Map<
  string,
  { progress: number; received: number; timestamp: number; total: number }
>();
const listeners = new Set<Listener>();

type DownloadTaskEvent =
  | { type: "start" }
  | { type: "begin" }
  | { type: "progress"; received: number; total: number; force?: boolean }
  | { type: "done" }
  | { type: "error"; error: string }
  | { type: "cancel" };

function setState(next: StoreState): void {
  state = next;
  for (const fn of listeners) fn();
}

function patchTask(id: string, patch: Partial<DownloadTask>): void {
  setState({ tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
}

/**
 * Applies every queue state transition through one reducer-like entry point.
 */
function transitionTask(taskId: string, event: DownloadTaskEvent): void {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  switch (event.type) {
    case "start":
      if (task.status === "queued") {
        patchTask(taskId, { status: "starting", progress: 0, error: null });
      }
      return;
    case "begin":
      if (task.status === "starting" || task.status === "downloading") {
        patchTask(taskId, { status: "downloading" });
      }
      return;
    case "progress":
      patchTaskProgress(taskId, event.received, event.total, event.force);
      return;
    case "done":
      if (task.status !== "cancelled") {
        patchTaskProgress(taskId, 1, 1, true);
        patchTask(taskId, { status: "done", progress: 1, error: null });
        notifyTaskDoneOnce(task);
      }
      return;
    case "error":
      if (task.status !== "cancelled") {
        patchTask(taskId, { status: "error", error: event.error });
        notifyTaskErrorOnce(task, event.error);
      }
      return;
    case "cancel":
      if (isActiveStatus(task.status)) {
        patchTask(taskId, { status: "cancelled", error: null });
      }
      return;
  }
}

/**
 * Emits one local notification when a task reaches completed state.
 */
function notifyTaskDoneOnce(task: DownloadTask): void {
  if (notifiedDoneTaskIds.has(task.id)) return;
  notifiedDoneTaskIds.add(task.id);
  void notifyDownloadState("done", task.label);
}

/**
 * Emits one local notification when a task reaches failed state.
 */
function notifyTaskErrorOnce(task: DownloadTask, error: string): void {
  if (notifiedErrorTaskIds.has(task.id)) return;
  notifiedErrorTaskIds.add(task.id);
  void notifyDownloadState("error", task.label, error);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): StoreState {
  return state;
}

/**
 * Returns a cached task summary that ignores progress-only changes.
 */
function getStatusSnapshot(): DownloadStatusTask[] {
  const nextKey = state.tasks
    .map((task) =>
      [
        task.id,
        task.libraryId,
        task.bookId ?? "",
        task.format ?? "",
        task.relativePath,
        task.status,
        task.error ?? "",
      ].join("\u0000"),
    )
    .join("\u0001");

  if (nextKey !== statusSnapshotKey) {
    statusSnapshotKey = nextKey;
    statusSnapshot = state.tasks.map((task) => ({
      id: task.id,
      libraryId: task.libraryId,
      bookId: task.bookId,
      format: task.format,
      relativePath: task.relativePath,
      status: task.status,
      error: task.error,
    }));
  }

  return statusSnapshot;
}

/**
 * Returns whether a task still occupies a downloader slot.
 */
function isActiveStatus(status: DownloadTaskStatus): boolean {
  return status === "queued" || status === "starting" || status === "downloading";
}

/**
 * Builds a deterministic native task id so restarts can reattach by metadata.
 */
function stableTaskId(libraryId: string, relativePath: string): string {
  const input = `${libraryId}:${relativePath}`;
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return `myreader-download-${libraryId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Math.abs(hash).toString(36)}`;
}

/**
 * Parses downloader metadata written by this app and ignores foreign tasks.
 */
function readTaskMetadata(task: RecoveredNativeDownload): DownloadTaskMetadata | null {
  const metadata = task.metadata;
  if (
    metadata?.source !== "myreader" ||
    typeof metadata.libraryId !== "string" ||
    typeof metadata.relativePath !== "string" ||
    typeof metadata.label !== "string"
  ) {
    return null;
  }
  return {
    source: "myreader",
    libraryId: metadata.libraryId,
    bookId: typeof metadata.bookId === "string" ? metadata.bookId : undefined,
    format: typeof metadata.format === "string" ? metadata.format : undefined,
    relativePath: metadata.relativePath,
    label: metadata.label,
  };
}

/**
 * Converts byte progress into the normalized value expected by existing UI.
 */
function progressFromBytes(downloaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(downloaded / total, 1));
}

/**
 * Coalesces native progress callbacks before notifying React subscribers.
 */
function patchTaskProgress(taskId: string, received: number, total: number, force = false): void {
  const previous = lastProgressNotifications.get(taskId);
  const effectiveTotal = total > 0 ? total : previous?.total ?? 0;
  const nextProgress = progressFromBytes(received, effectiveTotal);
  const progress =
    previous && received >= previous.received && nextProgress < previous.progress
      ? previous.progress
      : nextProgress;
  const now = Date.now();
  if (
    !force &&
    previous &&
    progress < 1 &&
    progress - previous.progress < DOWNLOAD_PROGRESS_MIN_DELTA &&
    now - previous.timestamp < DOWNLOAD_PROGRESS_MIN_INTERVAL_MS
  ) {
    return;
  }
  lastProgressNotifications.set(taskId, {
    progress,
    received: Math.max(received, previous?.received ?? 0),
    timestamp: now,
    total: effectiveTotal,
  });
  patchTask(taskId, { progress });
}

export async function enqueue(opts: EnqueueOptions): Promise<string> {
  const alreadyActive = state.tasks.some(
    (t) =>
      t.libraryId === opts.libraryId &&
      t.relativePath === opts.relativePath &&
      isActiveStatus(t.status),
  );
  if (alreadyActive) {
    const existingId = state.tasks.find(
      (t) =>
        t.libraryId === opts.libraryId &&
        t.relativePath === opts.relativePath &&
        isActiveStatus(t.status),
    )!.id;
    return existingId;
  }

  await checkLibraryConnectivity(opts.libraryId);

  const id = stableTaskId(opts.libraryId, opts.relativePath);
  const task: DownloadTask = {
    id,
    libraryId: opts.libraryId,
    bookId: opts.bookId,
    format: opts.format?.toUpperCase(),
    relativePath: opts.relativePath,
    label: opts.label,
    status: "queued",
    progress: 0,
    error: null,
  };
  setState({ tasks: [...state.tasks.filter((item) => item.id !== id), task] });
  alertedErrorTaskIds.delete(id);
  notifiedDoneTaskIds.delete(id);
  notifiedErrorTaskIds.delete(id);
  _runNext();
  return id;
}

export function cancel(taskId: string): void {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  if (task.status === "starting" || task.status === "downloading") {
    transitionTask(taskId, { type: "cancel" });
    nativeStopHandlers.get(taskId)?.();
    cancelNativeDownload(taskId);
  } else if (task.status === "queued") {
    transitionTask(taskId, { type: "cancel" });
  }
}

export function clearFinished(): void {
  for (const t of state.tasks) {
    if (t.status === "done" || t.status === "error" || t.status === "cancelled") {
      alertedErrorTaskIds.delete(t.id);
      notifiedDoneTaskIds.delete(t.id);
      notifiedErrorTaskIds.delete(t.id);
    }
  }
  setState({
    tasks: state.tasks.filter(
      (t) => t.status !== "done" && t.status !== "error" && t.status !== "cancelled",
    ),
  });
}

export function isTaskErrorAlerted(taskId: string): boolean {
  return alertedErrorTaskIds.has(taskId);
}

export function markTaskErrorAlerted(taskId: string): void {
  alertedErrorTaskIds.add(taskId);
}

/**
 * Removes finished tasks for a specific library path so that stale completions
 * do not override fresh evictions in UI derivation.
 */
export function dismissTasksForPath(libraryId: string, relativePath: string): void {
  const id = stableTaskId(libraryId, relativePath);
  const task = state.tasks.find((t) => t.id === id);
  if (task && !isActiveStatus(task.status)) {
    setState({ tasks: state.tasks.filter((t) => t.id !== id) });
    alertedErrorTaskIds.delete(id);
    notifiedDoneTaskIds.delete(id);
    notifiedErrorTaskIds.delete(id);
  }
}

function _runNext(): void {
  const activeCount = state.tasks.filter((t) => t.status === "starting" || t.status === "downloading").length;
  const queued = state.tasks.filter((t) => t.status === "queued");
  const slots = MAX_CONCURRENT - activeCount;
  for (let i = 0; i < Math.min(slots, queued.length); i++) {
    _startTask(queued[i]!.id).catch((err) => {
      console.error("[DownloadStore] _startTask unexpected throw (outside try-catch):", err);
    });
  }
}

async function _startTask(taskId: string): Promise<void> {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || task.status !== "queued") return;

  transitionTask(taskId, { type: "start" });

  try {
    const current = state.tasks.find((t) => t.id === taskId);
    if (!current || current.status === "cancelled") return;

    await checkLibraryConnectivity(task.libraryId);

    const afterCheck = state.tasks.find((t) => t.id === taskId);
    if (!afterCheck || afterCheck.status === "cancelled") return;

    const ctx = await openDownloadContextForLibrary(task.libraryId, getStoreLibraries(), getStoreDataSources());
    await downloadContextFile(
      ctx,
      task.relativePath,
      (received, total) => {
        transitionTask(taskId, { type: "progress", received, total });
      },
    );
    if (state.tasks.find((t) => t.id === taskId)?.status !== "cancelled") {
      transitionTask(taskId, { type: "done" });
    }
  } catch (err) {
    if (state.tasks.find((t) => t.id === taskId)?.status === "cancelled") {
      return;
    }
    cancelNativeDownload(taskId);
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.toLowerCase().includes("abort"));
    console.error("Failed to finish download task:", {
      taskId,
      relativePath: task.relativePath,
      isAbort,
      isConfigError: err instanceof SyncConfigError,
      error: err,
    });
    if (isAbort) {
      transitionTask(taskId, { type: "cancel" });
    } else {
      transitionTask(taskId, { type: "error", error: err instanceof Error ? err.message : String(err) });
    }
  } finally {
    nativeStopHandlers.delete(taskId);
    lastProgressNotifications.delete(taskId);
    _runNext();
  }
}

/**
 * Replays recovered completion once even if native DONE and callback DONE both fire.
 */
function finalizeRecoveredTaskOnce(task: DownloadTask): Promise<void> {
  if (finalizedRecoveredTaskIds.has(task.id)) return Promise.resolve();
  const existing = finalizingRecoveredTasks.get(task.id);
  if (existing) return existing;

  const libs = getStoreLibraries();
  const ds = getStoreDataSources();
  const promise = finalizeRecoveredDownload(task.libraryId, task.relativePath, libs, ds, (received, total) => {
    transitionTask(task.id, { type: "progress", received, total, force: true });
  })
    .then(() => {
      finalizedRecoveredTaskIds.add(task.id);
      completeNativeDownload(task.id);
      transitionTask(task.id, { type: "done" });
    })
    .catch((err) => {
      transitionTask(task.id, { type: "error", error: err instanceof Error ? err.message : String(err) });
      throw err;
    })
    .finally(() => {
      nativeStopHandlers.delete(task.id);
      lastProgressNotifications.delete(task.id);
      finalizingRecoveredTasks.delete(task.id);
    });

  finalizingRecoveredTasks.set(task.id, promise);
  return promise;
}

/**
 * Binds callbacks to an existing native task after app restart.
 */
function attachRecoveredTask(nativeTask: RecoveredNativeDownload, metadata: DownloadTaskMetadata): void {
  const id = nativeTask.id;
  const task: DownloadTask = {
    id,
    libraryId: metadata.libraryId,
    bookId: metadata.bookId,
    format: metadata.format?.toUpperCase(),
    relativePath: metadata.relativePath,
    label: metadata.label,
    status: nativeTask.state === "DONE" ? "done" : "downloading",
    progress: progressFromBytes(nativeTask.bytesDownloaded, nativeTask.bytesTotal),
    error: null,
  };

  nativeStopHandlers.set(id, nativeTask.stop);
  setState({ tasks: [...state.tasks.filter((item) => item.id !== id), task] });

  nativeTask.bind({
    onProgress: (bytesDownloaded, bytesTotal) => {
      transitionTask(id, { type: "progress", received: bytesDownloaded, total: bytesTotal });
    },
    onDone: (bytesDownloaded, bytesTotal) => {
      transitionTask(id, { type: "progress", received: bytesDownloaded, total: bytesTotal, force: true });
      transitionTask(id, { type: "begin" });
      void finalizeRecoveredTaskOnce(task).catch(() => undefined);
    },
    onError: (error, errorCode) => {
      nativeStopHandlers.delete(id);
      lastProgressNotifications.delete(id);
      if (isNativeCancel(error, errorCode)) {
        transitionTask(id, { type: "cancel" });
      } else {
        transitionTask(id, { type: "error", error });
      }
    },
  });

  if (nativeTask.state === "DONE") {
    void finalizeRecoveredTaskOnce(task).catch(() => undefined);
  }
}

/**
 * Reattaches any native downloads that survived process death.
 */
async function initializeExistingDownloadTasks(): Promise<void> {
  if (initializedExistingTasks) return;
  if (initializingExistingTasks) return initializingExistingTasks;

  initializingExistingTasks = recoverNativeDownloads()
    .then((tasks) => {
      for (const nativeTask of tasks) {
        const metadata = readTaskMetadata(nativeTask);
        if (metadata) {
          attachRecoveredTask(nativeTask, metadata);
        }
      }
      initializedExistingTasks = true;
    })
    .catch((err) => {
      console.error("[DownloadStore] Failed to recover download tasks:", err);
      initializedExistingTasks = true;
    })
    .finally(() => {
      initializingExistingTasks = null;
    });
  return initializingExistingTasks;
}

/**
 * Lazily initializes native task recovery from every hook entry point.
 */
function useEnsureDownloadStoreInitialized(): void {
  useEffect(() => {
    void initializeExistingDownloadTasks();
  }, []);
}

export function useDownloadStore(): StoreState {
  useEnsureDownloadStoreInitialized();
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useDownloadStatusTasks(): DownloadStatusTask[] {
  useEnsureDownloadStoreInitialized();
  return useSyncExternalStore(subscribe, getStatusSnapshot, () => []);
}

export function useActiveDownloadCount(): number {
  useEnsureDownloadStoreInitialized();
  return useSyncExternalStore(
    subscribe,
    () => state.tasks.filter((t) => t.status === "queued" || t.status === "starting" || t.status === "downloading").length,
    () => 0,
  );
}

/**
 * Looks up a task by its stable cache path within one library.
 */
export function useDownloadTaskForPath(
  libraryId: string,
  relativePath: string,
): DownloadTask | undefined {
  useEnsureDownloadStoreInitialized();
  return useSyncExternalStore(
    subscribe,
    () =>
      state.tasks.find(
        (t) =>
          t.libraryId === libraryId &&
          t.relativePath === relativePath &&
          (t.status === "queued" || t.status === "starting" || t.status === "downloading" || t.status === "done"),
      ),
    () => undefined,
  );
}

/**
 * Looks up an active detail-card task before the format path finishes loading.
 */
export function useDownloadTaskForBookFormat(
  libraryId: string,
  bookId: string,
  format: string,
): DownloadTask | undefined {
  useEnsureDownloadStoreInitialized();
  return useSyncExternalStore(
    subscribe,
    () =>
      state.tasks.find(
        (t) =>
          t.libraryId === libraryId &&
          t.bookId === bookId &&
          t.format === format.toUpperCase() &&
          (t.status === "queued" || t.status === "starting" || t.status === "downloading" || t.status === "done"),
      ),
    () => undefined,
  );
}

export const __downloadStoreTestApi = {
  getState: () => state,
  initializeExistingDownloadTasks,
  reset: () => {
    state = { tasks: [] };
    statusSnapshotKey = "";
    statusSnapshot = [];
    initializedExistingTasks = false;
    initializingExistingTasks = null;
    nativeStopHandlers.clear();
    finalizingRecoveredTasks.clear();
    finalizedRecoveredTaskIds.clear();
    alertedErrorTaskIds.clear();
    notifiedDoneTaskIds.clear();
    notifiedErrorTaskIds.clear();
    lastProgressNotifications.clear();
    listeners.clear();
  },
};
