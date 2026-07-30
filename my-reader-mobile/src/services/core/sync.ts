import {
  CoreFfiError,
  type SchedulerTransition as CoreSchedulerTransition,
  type SidecarStorageConfig as CoreSidecarStorageConfig,
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
  syncRecover,
  syncReleaseTask,
  syncRequest,
  syncRequestContextualPull,
  syncResume,
  syncRunSidecar,
  syncSetLibraryOnline,
} from "my-reader-core"
import { DataIntegrityError } from "@/src/errors"

export type {
  RetrySchedule,
  ScheduledSync,
  SidecarSyncMode,
  SidecarSyncReport,
  SyncExecution,
  SyncFailureKind,
  SyncTaskProgress,
  SyncTiming,
}

export type SchedulerTransition = Omit<
  CoreSchedulerTransition,
  "execution" | "retry"
> & {
  execution: SyncExecution | null
  retry: RetrySchedule | null
}

export type SidecarStorageConfig =
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

function storageToCore(
  storage: SidecarStorageConfig,
): CoreSidecarStorageConfig {
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
  freshnessMs: number
}): Promise<SchedulerTransition> {
  return transitionFromCore(
    await syncRequestContextualPull(
      input.coordinatorId,
      input.sidecarRootPath,
      input.libraryId,
      input.reason,
      input.nowMs,
      input.freshnessMs,
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
  freshnessMs: number
}): Promise<SyncExecution | null> {
  return (
    (await syncEffectiveExecution(
      input.coordinatorId,
      input.sidecarRootPath,
      input.execution,
      input.nowMs,
      input.freshnessMs,
    )) ?? null
  )
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

export function cancelSyncTask(taskId: string): boolean {
  return syncCancelTask(taskId)
}

export function releaseSyncTask(taskId: string): boolean {
  return syncReleaseTask(taskId)
}

export async function syncLibrarySidecar(input: {
  taskId: string
  sidecarRootPath: string
  libraryRootPath: string
  nowMs: number
  mode: SidecarSyncMode
  storage: SidecarStorageConfig
}): Promise<SidecarSyncReport> {
  try {
    return await syncRunSidecar(
      input.taskId,
      input.sidecarRootPath,
      input.libraryRootPath,
      input.nowMs,
      input.mode,
      storageToCore(input.storage),
    )
  } catch (error) {
    if (CoreFfiError.DataIntegrity.instanceOf(error)) {
      throw new DataIntegrityError(error.message)
    }
    throw error
  }
}
