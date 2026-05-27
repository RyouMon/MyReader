import {
  completeHandler,
  createDownloadTask,
  createUploadTask,
  getExistingDownloadTasks,
  getExistingUploadTasks,
  type DownloadTask as BackgroundDownloadTask,
  type UploadTask as BackgroundUploadTask,
} from "@kesha-antonov/react-native-background-downloader";

import { toNativeFilesystemPath } from "../fs/path";
import i18n from "@/src/i18n";

export type NativeDownloadOptions = {
  taskId?: string;
  metadata?: Record<string, unknown>;
  onBegin?: (expectedBytes: number) => void;
  onNativeTask?: (task: BackgroundDownloadTask) => void;
};

export type NativeDownloadRequest = {
  relativePath: string;
  url: string;
  destinationUri: string;
  headers?: Record<string, string>;
  onProgress?: (received: number, total: number) => void;
  options?: NativeDownloadOptions;
};

export type RecoveredNativeDownload = {
  id: string;
  metadata: BackgroundDownloadTask["metadata"];
  state: BackgroundDownloadTask["state"];
  bytesDownloaded: number;
  bytesTotal: number;
  bind: (handlers: NativeDownloadRecoveredHandlers) => void;
  stop: () => void;
};

export type NativeDownloadRecoveredHandlers = {
  onProgress?: (received: number, total: number) => void;
  onDone?: (received: number, total: number) => void;
  onError?: (error: string, errorCode: number) => void;
};

export type NativeDownloadResult = {
  bytesDownloaded: number;
  bytesTotal: number;
};

export type NativeUploadOptions = {
  taskId?: string;
  metadata?: Record<string, unknown>;
  onBegin?: (expectedBytes: number) => void;
  onNativeTask?: (task: BackgroundUploadTask) => void;
};

export type NativeUploadRequest = {
  relativePath: string;
  url: string;
  sourceUri: string;
  method?: "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  onProgress?: (sent: number, total: number) => void;
  options?: NativeUploadOptions;
};

export type RecoveredNativeUpload = {
  id: string;
  metadata: BackgroundUploadTask["metadata"];
  state: BackgroundUploadTask["state"];
  bytesUploaded: number;
  bytesTotal: number;
  bind: (handlers: NativeUploadRecoveredHandlers) => void;
  stop: () => void;
};

export type NativeUploadRecoveredHandlers = {
  onProgress?: (sent: number, total: number) => void;
  onDone?: (sent: number, total: number) => void;
  onError?: (error: string, errorCode: number) => void;
};

export type NativeUploadResult = {
  responseCode: number;
  responseBody: string;
  bytesUploaded: number;
  bytesTotal: number;
};

const NATIVE_DOWNLOAD_START_TIMEOUT_MS = 15000;

const activeTasks = new Map<string, BackgroundDownloadTask>();
const activeUploadTasks = new Map<string, BackgroundUploadTask>();

/** Abort handlers registered by in-flight startNativeDownload / startNativeUpload promises. */
const nativeAbortHandlers = new Map<string, () => void>();

/**
 * Converts Expo file URIs into the filesystem paths expected by the native downloader.
 */
export function toNativeDestinationPath(fileUri: string): string {
  return toNativeFilesystemPath(fileUri);
}

export const toNativeSourcePath = toNativeDestinationPath;

/**
 * Starts one native background download and settles from callbacks.
 */
export function startNativeDownload({
  relativePath,
  url,
  destinationUri,
  headers,
  onProgress,
  options = {},
}: NativeDownloadRequest): Promise<NativeDownloadResult> {
  const taskId = options.taskId ?? `download:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  console.info("Start to create native download task, params:", {
    taskId,
    relativePath,
    destinationUri,
    hasHeaders: Boolean(headers && Object.keys(headers).length > 0),
  });

  const task = createDownloadTask({
    id: taskId,
    url,
    destination: toNativeDestinationPath(destinationUri),
    headers,
    metadata: options.metadata,
  });

  activeTasks.set(taskId, task);
  options.onNativeTask?.(task);

  return new Promise((resolve, reject) => {
    let settled = false;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let stalledTimer: ReturnType<typeof setTimeout> | null = null;
    let hasNativeBegin = false;
    let lastDownloaded = 0;

    function abort(): void {
      if (settled) return;
      settled = true;
      finishCleanup();
      const err = new Error(i18n.t("sync.downloadCancelled"));
      err.name = "AbortError";
      reject(err);
    }
    nativeAbortHandlers.set(taskId, abort);

    function clearTimers(): void {
      if (startTimer) {
        clearTimeout(startTimer);
        startTimer = null;
      }
      if (stalledTimer) {
        clearTimeout(stalledTimer);
        stalledTimer = null;
      }
    }

    function finishCleanup(): void {
      clearTimers();
      activeTasks.delete(taskId);
      nativeAbortHandlers.delete(taskId);
    }

    function settleDone(bytesDownloaded: number, bytesTotal: number): void {
      if (settled) return;
      settled = true;
      finishCleanup();
      onProgress?.(bytesDownloaded, bytesTotal);
      completeNativeTask(taskId);
      console.info("Success to finish native download task:", {
        taskId,
        relativePath,
        bytesDownloaded,
        bytesTotal,
      });
      resolve({ bytesDownloaded, bytesTotal });
    }

    function settleError(error: string, errorCode: number): void {
      if (settled) return;
      settled = true;
      finishCleanup();
      const err = new Error(error || i18n.t("sync.downloadFailed", { code: errorCode }));
      if (isNativeCancel(error, errorCode)) {
        err.name = "AbortError";
      }
      console.error("Failed to run native download task:", {
        taskId,
        relativePath,
        errorCode,
        error,
      });
      reject(err);
    }

    function resetStalledTimer(): void {
      if (stalledTimer) clearTimeout(stalledTimer);
      stalledTimer = setTimeout(() => {
        settleError(i18n.t("sync.downloadStalled"), 0);
      }, NATIVE_DOWNLOAD_START_TIMEOUT_MS * 4);
    }

    function markNativeBegin(expectedBytes: number): void {
      if (hasNativeBegin) return;
      hasNativeBegin = true;
      options.onBegin?.(expectedBytes);
      resetStalledTimer();
    }

    function updateNativeProgress(bytesDownloaded: number, bytesTotal: number): void {
      if (bytesDownloaded > 0 || bytesTotal > 0) {
        markNativeBegin(bytesTotal);
      }
      if (bytesDownloaded > lastDownloaded) {
        lastDownloaded = bytesDownloaded;
        resetStalledTimer();
      }
      onProgress?.(bytesDownloaded, bytesTotal);
    }

    task
      .begin(({ expectedBytes }) => {
        markNativeBegin(expectedBytes);
        console.info("Start to receive native download bytes, params:", {
          taskId,
          relativePath,
          expectedBytes,
        });
        onProgress?.(0, expectedBytes);
      })
      .progress(({ bytesDownloaded, bytesTotal }) => {
        updateNativeProgress(bytesDownloaded, bytesTotal);
      })
      .done(({ bytesDownloaded, bytesTotal }) => {
        settleDone(bytesDownloaded, bytesTotal);
      })
      .error(({ error, errorCode }) => {
        settleError(error, errorCode);
      });

    try {
      task.start();
      startTimer = setTimeout(() => {
        if (settled || hasNativeBegin) return;
        settleError(i18n.t("sync.downloadNotStarted"), 0);
      }, NATIVE_DOWNLOAD_START_TIMEOUT_MS);
    } catch (err) {
      settled = true;
      finishCleanup();
      reject(err);
    }
  });
}

export function startNativeUpload({
  relativePath,
  url,
  sourceUri,
  method = "PUT",
  headers,
  onProgress,
  options = {},
}: NativeUploadRequest): Promise<NativeUploadResult> {
  const taskId = options.taskId ?? `upload:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  console.info("Start to create native upload task, params:", {
    taskId,
    relativePath,
    sourceUri,
    method,
    hasHeaders: Boolean(headers && Object.keys(headers).length > 0),
  });

  const task = createUploadTask({
    id: taskId,
    url,
    source: toNativeSourcePath(sourceUri),
    method,
    headers,
    metadata: options.metadata,
  });

  activeUploadTasks.set(taskId, task);
  options.onNativeTask?.(task);

  return new Promise((resolve, reject) => {
    let settled = false;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let stalledTimer: ReturnType<typeof setTimeout> | null = null;
    let hasNativeBegin = false;
    let lastUploaded = 0;

    function abort(): void {
      if (settled) return;
      settled = true;
      finishCleanup();
      const err = new Error(i18n.t("sync.uploadCancelled"));
      err.name = "AbortError";
      reject(err);
    }
    nativeAbortHandlers.set(taskId, abort);

    function clearTimers(): void {
      if (startTimer) {
        clearTimeout(startTimer);
        startTimer = null;
      }
      if (stalledTimer) {
        clearTimeout(stalledTimer);
        stalledTimer = null;
      }
    }

    function finishCleanup(): void {
      clearTimers();
      activeUploadTasks.delete(taskId);
      nativeAbortHandlers.delete(taskId);
    }

    function settleDone(
      responseCode: number,
      responseBody: string,
      bytesUploaded: number,
      bytesTotal: number,
    ): void {
      if (settled) return;
      if (responseCode < 200 || responseCode >= 300) {
        settleError(i18n.t("sync.uploadFailed", { status: responseCode, body: responseBody }), responseCode);
        return;
      }
      settled = true;
      finishCleanup();
      onProgress?.(bytesUploaded, bytesTotal);
      completeNativeTask(taskId);
      console.info("Success to finish native upload task:", {
        taskId,
        relativePath,
        responseCode,
        bytesUploaded,
        bytesTotal,
      });
      resolve({ responseCode, responseBody, bytesUploaded, bytesTotal });
    }

    function settleError(error: string, errorCode: number): void {
      if (settled) return;
      settled = true;
      finishCleanup();
      const err = new Error(error || i18n.t("sync.uploadFailedCode", { code: errorCode }));
      if (isNativeCancel(error, errorCode)) {
        err.name = "AbortError";
      }
      console.error("Failed to run native upload task:", {
        taskId,
        relativePath,
        errorCode,
        error,
      });
      reject(err);
    }

    function resetStalledTimer(): void {
      if (stalledTimer) clearTimeout(stalledTimer);
      stalledTimer = setTimeout(() => {
        settleError(i18n.t("sync.uploadStalled"), 0);
      }, NATIVE_DOWNLOAD_START_TIMEOUT_MS * 4);
    }

    function markNativeBegin(expectedBytes: number): void {
      if (hasNativeBegin) return;
      hasNativeBegin = true;
      options.onBegin?.(expectedBytes);
      resetStalledTimer();
    }

    function updateNativeProgress(bytesUploaded: number, bytesTotal: number): void {
      if (bytesUploaded > 0 || bytesTotal > 0) {
        markNativeBegin(bytesTotal);
      }
      if (bytesUploaded > lastUploaded) {
        lastUploaded = bytesUploaded;
        resetStalledTimer();
      }
      onProgress?.(bytesUploaded, bytesTotal);
    }

    task
      .begin(({ expectedBytes }) => {
        markNativeBegin(expectedBytes);
        console.info("Start to send native upload bytes, params:", {
          taskId,
          relativePath,
          expectedBytes,
        });
        onProgress?.(0, expectedBytes);
      })
      .progress(({ bytesUploaded, bytesTotal }) => {
        updateNativeProgress(bytesUploaded, bytesTotal);
      })
      .done(({ responseCode, responseBody, bytesUploaded, bytesTotal }) => {
        settleDone(responseCode, responseBody, bytesUploaded, bytesTotal);
      })
      .error(({ error, errorCode }) => {
        settleError(error, errorCode);
      });

    try {
      task.start();
      startTimer = setTimeout(() => {
        if (settled || hasNativeBegin) return;
        settleError(i18n.t("sync.uploadNotStarted"), 0);
      }, NATIVE_DOWNLOAD_START_TIMEOUT_MS);
    } catch (err) {
      settled = true;
      finishCleanup();
      reject(err);
    }
  });
}

/**
 * Reattaches all native tasks that survived process death.
 */
export async function recoverNativeDownloads(): Promise<RecoveredNativeDownload[]> {
  const tasks = await getExistingDownloadTasks();
  return tasks.map((task) => ({
    id: task.id,
    metadata: task.metadata,
    state: task.state,
    bytesDownloaded: task.bytesDownloaded,
    bytesTotal: task.bytesTotal,
    bind: (handlers) => {
      task
        .progress(({ bytesDownloaded, bytesTotal }) => {
          handlers.onProgress?.(bytesDownloaded, bytesTotal);
        })
        .done(({ bytesDownloaded, bytesTotal }) => {
          handlers.onDone?.(bytesDownloaded, bytesTotal);
        })
        .error(({ error, errorCode }) => {
          handlers.onError?.(error, errorCode);
        });
    },
    stop: () => {
      void task.stop();
    },
  }));
}

export async function recoverNativeUploads(): Promise<RecoveredNativeUpload[]> {
  const tasks = await getExistingUploadTasks();
  return tasks.map((task) => ({
    id: task.id,
    metadata: task.metadata,
    state: task.state,
    bytesUploaded: task.bytesUploaded,
    bytesTotal: task.bytesTotal,
    bind: (handlers) => {
      task
        .progress(({ bytesUploaded, bytesTotal }) => {
          handlers.onProgress?.(bytesUploaded, bytesTotal);
        })
        .done(({ bytesUploaded, bytesTotal }) => {
          handlers.onDone?.(bytesUploaded, bytesTotal);
        })
        .error(({ error, errorCode }) => {
          handlers.onError?.(error, errorCode);
        });
    },
    stop: () => {
      void task.stop();
    },
  }));
}

/**
 * Stops a known native task without touching the JS queue state.
 */
export function cancelNativeDownload(taskId: string): void {
  nativeAbortHandlers.get(taskId)?.();
  void activeTasks.get(taskId)?.stop();
}

export function cancelNativeUpload(taskId: string): void {
  nativeAbortHandlers.get(taskId)?.();
  void activeUploadTasks.get(taskId)?.stop();
}

/**
 * Signals iOS/Android that background work for this native task is complete.
 */
export function completeNativeTask(taskId: string): void {
  completeHandler(taskId);
}

export const completeNativeDownload = completeNativeTask;

export function isNativeCancel(error: string, errorCode: number): boolean {
  return errorCode === -999 || error.toLowerCase().includes("cancel");
}
