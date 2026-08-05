import {
  CoreFfiError,
  type SchedulerTransition as CoreSchedulerTransition,
  type LibraryStorageConfig as CoreLibraryStorageConfig,
  type RemoteCredential,
  type LibrarySyncReport as CoreLibrarySyncReport,
  type LibrarySyncScope,
  type RetrySchedule,
  type ScheduledSync,
  type SidecarSyncMode,
  type SidecarSyncReport,
  type SyncExecution,
  type SyncFailureKind,
  type SyncTaskProgress,
  type SyncTiming,
  syncBegin,
  syncCancelTask,
  syncComplete,
  syncCreateCoordinator,
  syncDisposeCoordinator,
  syncEffectiveExecution,
  syncFail,
  syncFlush,
  syncReadTaskProgress,
  syncReadTaskSidecarReport,
  syncRecover,
  syncReleaseTask,
  syncResolveLibraryStorage,
  syncRequest,
  syncRequestContextualPull,
  syncResume,
  syncRunLibrary,
  syncSafetySweepDelayMs,
  syncSetLibraryOnline,
} from "my-reader-core"
import type { Library } from "@my-reader/tools/types/library"
import { DataIntegrityError } from "@/src/errors"

export type {
  RetrySchedule,
  ScheduledSync,
  LibrarySyncScope,
  SidecarSyncMode,
  SidecarSyncReport,
  SyncExecution,
  SyncFailureKind,
  SyncTaskProgress,
  SyncTiming,
}

export type LibrarySyncReport = Omit<CoreLibrarySyncReport, "calibre"> & {
  calibre: Omit<CoreLibrarySyncReport["calibre"], "library"> & {
    library: Library
  }
}

export type SchedulerTransition = Omit<
  CoreSchedulerTransition,
  "execution" | "retry"
> & {
  execution: SyncExecution | null
  retry: RetrySchedule | null
}

export type LibraryStorageConfig =
  | { kind: "local-direct"; root: string }
  | {
      kind: "webdav"
      endpoint: string
      username: string
      password: string
      root: string | null
    }
  | {
      kind: "onedrive"
      accessToken: string
      root: string | null
    }

function transitionFromCore(
  transition: CoreSchedulerTransition,
): SchedulerTransition {
  return {
    ...transition,
    execution: transition.execution ?? null,
    retry: transition.retry ?? null,
  }
}

function syncReportFromCore(report: CoreLibrarySyncReport): LibrarySyncReport {
  return {
    ...report,
    calibre: {
      ...report.calibre,
      library: {
        ...report.calibre.library,
        libraryType:
          report.calibre.library.libraryType === "myreader"
            ? "myreader"
            : "calibre",
      },
    },
  }
}

export function toCoreLibraryStorage(
  storage: LibraryStorageConfig,
): CoreLibraryStorageConfig {
  switch (storage.kind) {
    case "local-direct":
      return { kind: storage.kind, root: storage.root }
    case "webdav":
      return {
        kind: storage.kind,
        endpoint: storage.endpoint,
        username: storage.username,
        password: storage.password,
        root: storage.root ?? undefined,
      }
    case "onedrive":
      return {
        kind: storage.kind,
        accessToken: storage.accessToken,
        root: storage.root ?? undefined,
      }
  }
}

function storageFromCore(
  storage: CoreLibraryStorageConfig,
): LibraryStorageConfig {
  switch (storage.kind) {
    case "local-direct":
      if (!storage.root) throw new Error("LIBRARY_ROOT_PATH_REQUIRED")
      return { kind: storage.kind, root: storage.root }
    case "webdav":
      if (!storage.endpoint || !storage.username || !storage.password) {
        throw new Error("WEBDAV_STORAGE_CONFIG_INVALID")
      }
      return {
        kind: storage.kind,
        endpoint: storage.endpoint,
        username: storage.username,
        password: storage.password,
        root: storage.root ?? null,
      }
    case "onedrive":
      if (!storage.accessToken) {
        throw new Error("ONEDRIVE_STORAGE_CONFIG_INVALID")
      }
      return {
        kind: storage.kind,
        accessToken: storage.accessToken,
        root: storage.root ?? null,
      }
    default:
      throw new Error(`Unsupported sidecar storage type: ${storage.kind}`)
  }
}

export function resolveLibraryStorage(input: {
  configPath: string
  libraryId: string
  localRootPath: string
  credential?: RemoteCredential
}): LibraryStorageConfig {
  return storageFromCore(
    syncResolveLibraryStorage(
      input.configPath,
      input.libraryId,
      input.localRootPath,
      input.credential,
    ),
  )
}

export function createSyncCoordinator(coordinatorId: string): boolean {
  return syncCreateCoordinator(coordinatorId)
}

export function requestCoordinatedSync(input: {
  coordinatorId: string
  libraryId: string
  mode: SidecarSyncMode
  reason: string
  timing: SyncTiming
  nowMs: number
}): SchedulerTransition {
  return transitionFromCore(
    syncRequest(
      input.coordinatorId,
      input.libraryId,
      input.mode,
      input.reason,
      input.timing,
      input.nowMs,
    ),
  )
}

export function flushCoordinatedSync(input: {
  coordinatorId: string
  libraryId: string
  reason: string
  nowMs: number
}): SchedulerTransition {
  return transitionFromCore(
    syncFlush(input.coordinatorId, input.libraryId, input.reason, input.nowMs),
  )
}

export async function recoverCoordinatedSync(input: {
  coordinatorId: string
  sidecarRootPath: string
  libraryId: string
  nowMs: number
}): Promise<SchedulerTransition> {
  return transitionFromCore(
    await syncRecover(
      input.coordinatorId,
      input.sidecarRootPath,
      input.libraryId,
      input.nowMs,
    ),
  )
}

export async function requestCoordinatedPull(input: {
  coordinatorId: string
  sidecarRootPath: string
  libraryId: string
  reason: string
  nowMs: number
}): Promise<SchedulerTransition> {
  return transitionFromCore(
    await syncRequestContextualPull(
      input.coordinatorId,
      input.sidecarRootPath,
      input.libraryId,
      input.reason,
      input.nowMs,
    ),
  )
}

export function beginCoordinatedSync(input: {
  coordinatorId: string
  libraryId: string
  generation: number
}): SchedulerTransition {
  return transitionFromCore(
    syncBegin(input.coordinatorId, input.libraryId, input.generation),
  )
}

export async function effectiveCoordinatedSyncExecution(input: {
  coordinatorId: string
  sidecarRootPath: string
  execution: SyncExecution
  nowMs: number
}): Promise<SyncExecution | null> {
  return (
    (await syncEffectiveExecution(
      input.coordinatorId,
      input.sidecarRootPath,
      input.execution,
      input.nowMs,
    )) ?? null
  )
}

export function safetySweepDelayMs(
  coordinatorId: string,
  randomFraction: number,
): number {
  return syncSafetySweepDelayMs(coordinatorId, randomFraction)
}

export function completeCoordinatedSync(input: {
  coordinatorId: string
  libraryId: string
  nowMs: number
}): SchedulerTransition {
  return transitionFromCore(
    syncComplete(input.coordinatorId, input.libraryId, input.nowMs),
  )
}

export function resumeCoordinatedSync(input: {
  coordinatorId: string
  libraryId: string
  nowMs: number
}): SchedulerTransition {
  return transitionFromCore(
    syncResume(input.coordinatorId, input.libraryId, input.nowMs),
  )
}

export async function failCoordinatedSync(input: {
  coordinatorId: string
  sidecarRootPath: string
  execution: SyncExecution
  failureKind: SyncFailureKind
  reason: string
  nowMs: number
  randomFraction: number
}): Promise<SchedulerTransition> {
  return transitionFromCore(
    await syncFail(
      input.coordinatorId,
      input.sidecarRootPath,
      input.execution,
      input.failureKind,
      input.reason,
      input.nowMs,
      input.randomFraction,
    ),
  )
}

export function setCoordinatedSyncLibraryOnline(input: {
  coordinatorId: string
  libraryId: string
  online: boolean
  nowMs: number
}): SchedulerTransition {
  return transitionFromCore(
    syncSetLibraryOnline(
      input.coordinatorId,
      input.libraryId,
      input.online,
      input.nowMs,
    ),
  )
}

export function disposeSyncCoordinator(
  coordinatorId: string,
): SchedulerTransition {
  return transitionFromCore(syncDisposeCoordinator(coordinatorId))
}

export function readSyncTaskProgress(taskId: string): SyncTaskProgress | null {
  return syncReadTaskProgress(taskId) ?? null
}

export function readSyncTaskSidecarReport(
  taskId: string,
): SidecarSyncReport | null {
  return syncReadTaskSidecarReport(taskId) ?? null
}

export function cancelSyncTask(taskId: string): boolean {
  return syncCancelTask(taskId)
}

export function releaseSyncTask(taskId: string): boolean {
  return syncReleaseTask(taskId)
}

export async function syncLibraryData(input: {
  taskId: string
  configPath: string
  sidecarRootPath: string
  libraryRootPath: string
  libraryId: string
  nowMs: number
  scope: LibrarySyncScope
  forceCalibre: boolean
  mode: SidecarSyncMode
  storage: LibraryStorageConfig
}): Promise<LibrarySyncReport> {
  try {
    return syncReportFromCore(
      await syncRunLibrary(
        input.taskId,
        input.configPath,
        input.sidecarRootPath,
        input.libraryRootPath,
        input.libraryId,
        input.nowMs,
        input.scope,
        input.forceCalibre,
        input.mode,
        toCoreLibraryStorage(input.storage),
      ),
    )
  } catch (error) {
    if (CoreFfiError.DataIntegrity.instanceOf(error)) {
      throw new DataIntegrityError(error.message)
    }
    throw error
  }
}
