import {
  completeHandler,
  createDownloadTask,
  createUploadTask,
  getExistingDownloadTasks,
  getExistingUploadTasks,
  type DownloadTask as BackgroundDownloadTask,
  type UploadTask as BackgroundUploadTask,
} from "@kesha-antonov/react-native-background-downloader";
import { File } from "expo-file-system";

import { toNativeFilesystemPath } from "../utils/io";

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

const NATIVE_DOWNLOAD_POLL_INTERVAL_MS = 1000;
const NATIVE_DOWNLOAD_START_TIMEOUT_MS = 15000;

const activeTasks = new Map<string, BackgroundDownloadTask>();
const activeUploadTasks = new Map<string, BackgroundUploadTask>();

/**
 * Converts Expo file URIs into the filesystem paths expected by the native downloader.
 */
export function toNativeDestinationPath(fileUri: string): string {
  return toNativeFilesystemPath(fileUri);
}

export const toNativeSourcePath = toNativeDestinationPath;

/**
 * Starts one native background download and settles from either callbacks or polling.
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
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let stalledTimer: ReturnType<typeof setTimeout> | null = null;
    let hasNativeBegin = false;
    let isPolling = false;
    let lastDownloaded = 0;
    let missingPollCount = 0;

    /**
     * Cancels timers owned by this native task attempt.
     */
    function clearTimers(): void {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (startTimer) {
        clearTimeout(startTimer);
        startTimer = null;
      }
      if (stalledTimer) {
        clearTimeout(stalledTimer);
        stalledTimer = null;
      }
    }

    /**
     * Releases native task references after a terminal event.
     */
    function finishCleanup(): void {
      clearTimers();
      activeTasks.delete(taskId);
    }

    /**
     * Resolves the JS promise after native work has fully completed.
     */
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

    /**
     * Rejects with an AbortError name when the native layer reports cancellation.
     */
    function settleError(error: string, errorCode: number): void {
      if (settled) return;
      settled = true;
      finishCleanup();
      const err = new Error(error || `后台下载失败: ${errorCode}`);
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

    /**
     * Detects transfers that began but no longer make progress.
     */
    function resetStalledTimer(): void {
      if (stalledTimer) clearTimeout(stalledTimer);
      stalledTimer = setTimeout(() => {
        settleError("原生下载已有字节传输，但长时间没有进度更新。请检查网络、WebDAV Range 支持或系统后台限制。", 0);
      }, NATIVE_DOWNLOAD_START_TIMEOUT_MS * 4);
    }

    /**
     * Emits the first byte-transfer signal once for queue state transitions.
     */
    function markNativeBegin(expectedBytes: number): void {
      if (hasNativeBegin) return;
      hasNativeBegin = true;
      options.onBegin?.(expectedBytes);
      resetStalledTimer();
    }

    /**
     * Normalizes callback and polling progress into one monotonic stream.
     */
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

    /**
     * Some native downloader implementations remove completed tasks before JS
     * receives the done callback; trust a non-empty destination file in that case.
     */
    function settleFromDestinationIfPresent(): boolean {
      const file = new File(destinationUri);
      const size = file.exists ? (file.size ?? 0) : 0;
      if (size <= 0) {
        return false;
      }
      settleDone(size, size);
      return true;
    }

    /**
     * Polls native state so completion still arrives when JS callbacks are dropped.
     */
    function startNativeTaskPolling(): void {
      pollTimer = setInterval(() => {
        if (settled || isPolling) return;
        isPolling = true;
        void getExistingDownloadTasks()
          .then((tasks) => {
            const existingTask = tasks.find((item) => item.id === taskId);
            if (settled) return;
            if (!existingTask) {
              missingPollCount += 1;
              if (hasNativeBegin && missingPollCount >= 3) {
                if (settleFromDestinationIfPresent()) return;
                settleError("原生下载任务已开始，但随后从系统下载队列消失。", 0);
              }
              return;
            }

            missingPollCount = 0;
            if (existingTask.bytesDownloaded > 0 || existingTask.bytesTotal > 0) {
              updateNativeProgress(existingTask.bytesDownloaded, existingTask.bytesTotal);
            }
            if (existingTask.state === "DONE") {
              settleDone(existingTask.bytesDownloaded, existingTask.bytesTotal);
            }
          })
          .catch((err) => {
            console.warn("Failed to poll native download task:", {
              taskId,
              relativePath,
              error: err,
            });
          })
          .finally(() => {
            isPolling = false;
          });
      }, NATIVE_DOWNLOAD_POLL_INTERVAL_MS);
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
      startNativeTaskPolling();
      startTimer = setTimeout(() => {
        if (settled || hasNativeBegin) return;
        settleError("原生下载任务已创建，但没有开始传输。请检查 WebDAV URL、认证或原生下载器配置。", 0);
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
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let stalledTimer: ReturnType<typeof setTimeout> | null = null;
    let hasNativeBegin = false;
    let isPolling = false;
    let lastUploaded = 0;
    let missingPollCount = 0;

    function clearTimers(): void {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
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
    }

    function settleDone(
      responseCode: number,
      responseBody: string,
      bytesUploaded: number,
      bytesTotal: number,
    ): void {
      if (settled) return;
      if (responseCode < 200 || responseCode >= 300) {
        settleError(`后台上传失败: HTTP ${responseCode} ${responseBody}`, responseCode);
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
      const err = new Error(error || `后台上传失败: ${errorCode}`);
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
        settleError("原生上传已有字节传输，但长时间没有进度更新。请检查网络、WebDAV 认证或系统后台限制。", 0);
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

    function startNativeTaskPolling(): void {
      pollTimer = setInterval(() => {
        if (settled || isPolling) return;
        isPolling = true;
        void getExistingUploadTasks()
          .then((tasks) => {
            const existingTask = tasks.find((item) => item.id === taskId);
            if (settled) return;
            if (!existingTask) {
              missingPollCount += 1;
              if (hasNativeBegin && missingPollCount >= 3) {
                settleError("原生上传任务已开始，但随后从系统上传队列消失。", 0);
              }
              return;
            }

            missingPollCount = 0;
            if (existingTask.bytesUploaded > 0 || existingTask.bytesTotal > 0) {
              updateNativeProgress(existingTask.bytesUploaded, existingTask.bytesTotal);
            }
            if (existingTask.state === "DONE") {
              settleDone(200, "", existingTask.bytesUploaded, existingTask.bytesTotal);
            }
          })
          .catch((err) => {
            console.warn("Failed to poll native upload task:", {
              taskId,
              relativePath,
              error: err,
            });
          })
          .finally(() => {
            isPolling = false;
          });
      }, NATIVE_DOWNLOAD_POLL_INTERVAL_MS);
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
      startNativeTaskPolling();
      startTimer = setTimeout(() => {
        if (settled || hasNativeBegin) return;
        settleError("原生上传任务已创建，但没有开始传输。请检查 WebDAV URL、认证或原生上传器配置。", 0);
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
  void activeTasks.get(taskId)?.stop();
}

export function cancelNativeUpload(taskId: string): void {
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
