import type {
  ScheduledSync,
  SchedulerTransition,
  SidecarStorageConfig,
  SidecarSyncMode,
  SidecarSyncReport,
  SyncExecution,
  SyncFailureKind,
  SyncTaskProgress,
  SyncTiming,
} from "./contract.generated"
import { invokeCoreAsync, invokeCoreSync } from "./transport"

export type {
  ScheduledSync,
  SchedulerTransition,
  SidecarStorageConfig,
  SidecarSyncMode,
  SidecarSyncReport,
  SyncExecution,
  SyncFailureKind,
  SyncTaskProgress,
  SyncTiming,
}

export function createSyncCoordinator(coordinatorId: string): boolean {
  return invokeCoreSync("sync", "createCoordinator", { coordinatorId })
}

export function requestCoordinatedSync(input: {
  coordinatorId: string
  libraryId: string
  mode: SidecarSyncMode
  reason: string
  timing: SyncTiming
  nowMs: number
}): SchedulerTransition {
  return invokeCoreSync("sync", "request", input)
}

export function flushCoordinatedSync(input: {
  coordinatorId: string
  libraryId: string
  reason: string
  nowMs: number
}): SchedulerTransition {
  return invokeCoreSync("sync", "flush", input)
}

export function recoverCoordinatedSync(input: {
  coordinatorId: string
  sidecarRootPath: string
  libraryId: string
  nowMs: number
}): Promise<SchedulerTransition> {
  return invokeCoreAsync("sync", "recover", input)
}

export function requestCoordinatedPull(input: {
  coordinatorId: string
  sidecarRootPath: string
  libraryId: string
  reason: string
  nowMs: number
  freshnessMs: number
}): Promise<SchedulerTransition> {
  return invokeCoreAsync("sync", "requestContextualPull", input)
}

export function beginCoordinatedSync(input: {
  coordinatorId: string
  libraryId: string
  generation: number
}): SchedulerTransition {
  return invokeCoreSync("sync", "begin", input)
}

export function effectiveCoordinatedSyncExecution(input: {
  coordinatorId: string
  sidecarRootPath: string
  execution: SyncExecution
  nowMs: number
  freshnessMs: number
}): Promise<SyncExecution | null> {
  return invokeCoreAsync("sync", "effectiveExecution", input)
}

export function completeCoordinatedSync(input: {
  coordinatorId: string
  libraryId: string
  nowMs: number
}): SchedulerTransition {
  return invokeCoreSync("sync", "complete", input)
}

export function failCoordinatedSync(input: {
  coordinatorId: string
  sidecarRootPath: string
  execution: SyncExecution
  failureKind: SyncFailureKind
  reason: string
  nowMs: number
  randomFraction: number
}): Promise<SchedulerTransition> {
  return invokeCoreAsync("sync", "fail", input)
}

export function setCoordinatedSyncLibraryOnline(input: {
  coordinatorId: string
  libraryId: string
  online: boolean
  nowMs: number
}): SchedulerTransition {
  return invokeCoreSync("sync", "setLibraryOnline", input)
}

export function disposeSyncCoordinator(
  coordinatorId: string,
): SchedulerTransition {
  return invokeCoreSync("sync", "disposeCoordinator", { coordinatorId })
}

export function readSyncTaskProgress(taskId: string): SyncTaskProgress | null {
  return invokeCoreSync("sync", "readTaskProgress", { taskId })
}

export function cancelSyncTask(taskId: string): boolean {
  return invokeCoreSync("sync", "cancelTask", { taskId })
}

export function releaseSyncTask(taskId: string): boolean {
  return invokeCoreSync("sync", "releaseTask", { taskId })
}

export function syncLibrarySidecar(input: {
  taskId: string
  sidecarRootPath: string
  libraryRootPath: string
  nowMs: number
  mode: SidecarSyncMode
  storage: SidecarStorageConfig
}): Promise<SidecarSyncReport> {
  return invokeCoreAsync("sync", "runSidecar", input)
}
