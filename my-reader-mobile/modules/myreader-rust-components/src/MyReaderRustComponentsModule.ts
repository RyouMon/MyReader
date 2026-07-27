import { requireNativeModule } from "expo"

export type NativeSyncDocumentCommandResult = {
  schemaVersion: number
  heads: string[]
  projectionJson: string
}

export type NativeSyncDatabaseIdentity = {
  libraryUuid: string
  replicaId: string
}

export type NativeSyncDatabaseScheduleState = {
  lastSuccessfulPullAt: number | null
  nextRetryAt: number | null
  transientFailureCount: number
  suspendedReason: string | null
}

export type NativeSyncDatabaseDiagnostics = {
  schemaVersion: number | null
  heads: string[]
  changes: number
  pendingOutbox: number
  receipts: number
  projectionVersion: number | null
}

export type NativeSyncLibrarySidecarReport = {
  pushed: number
  pulled: number
}

export type NativeSyncTaskProgress = {
  taskId: string
  stage: string
  completed: number
  total: number
}

export type MyReaderRustComponentsModule = {
  migrateLibraryDatabase(databasePath: string): Promise<void>
  syncContractVersion(): number
  advanceSyncScheduler(
    stateJson: string | null,
    policyJson: string,
    eventJson: string,
  ): string
  ensureSyncDatabaseIdentity(
    databasePath: string,
    libraryUuid: string,
  ): Promise<NativeSyncDatabaseIdentity>
  readSyncDatabaseScheduleState(
    databasePath: string,
  ): Promise<NativeSyncDatabaseScheduleState | null>
  writeSyncDatabaseScheduleState(
    databasePath: string,
    lastSuccessfulPullAt: number | null,
    nextRetryAt: number | null,
    transientFailureCount: number,
    suspendedReason: string | null,
  ): Promise<void>
  markSyncDatabaseScheduleSucceeded(
    databasePath: string,
    completedPullAt: number | null,
  ): Promise<void>
  ensureSyncDatabaseDocument(
    databasePath: string,
    libraryUuid: string,
    replicaId: string,
    nowMs: string,
  ): Promise<NativeSyncDocumentCommandResult>
  executeSyncDatabaseCommand(
    databasePath: string,
    libraryUuid: string,
    replicaId: string,
    nowMs: string,
    commandJson: string,
  ): Promise<NativeSyncDocumentCommandResult>
  hasSyncDatabasePendingWork(databasePath: string): Promise<boolean>
  readSyncDatabaseDiagnostics(
    databasePath: string,
  ): Promise<NativeSyncDatabaseDiagnostics>
  readSyncTaskProgress(taskId: string): NativeSyncTaskProgress | null
  cancelSyncTask(taskId: string): boolean
  releaseSyncTask(taskId: string): boolean
  syncLibrarySidecar(
    taskId: string,
    databasePath: string,
    libraryUuid: string,
    replicaId: string,
    nowMs: string,
    mode: string,
    storageJson: string,
  ): Promise<NativeSyncLibrarySidecarReport>
}

let nativeModule: MyReaderRustComponentsModule | null = null

function getNativeModule(): MyReaderRustComponentsModule {
  nativeModule ??= requireNativeModule<MyReaderRustComponentsModule>(
    "MyReaderRustComponents",
  )
  return nativeModule
}

const moduleFacade: MyReaderRustComponentsModule = {
  migrateLibraryDatabase(databasePath) {
    return getNativeModule().migrateLibraryDatabase(databasePath)
  },
  syncContractVersion() {
    return getNativeModule().syncContractVersion()
  },
  advanceSyncScheduler(stateJson, policyJson, eventJson) {
    return getNativeModule().advanceSyncScheduler(
      stateJson,
      policyJson,
      eventJson,
    )
  },
  ensureSyncDatabaseIdentity(databasePath, libraryUuid) {
    return getNativeModule().ensureSyncDatabaseIdentity(
      databasePath,
      libraryUuid,
    )
  },
  readSyncDatabaseScheduleState(databasePath) {
    return getNativeModule().readSyncDatabaseScheduleState(databasePath)
  },
  writeSyncDatabaseScheduleState(
    databasePath,
    lastSuccessfulPullAt,
    nextRetryAt,
    transientFailureCount,
    suspendedReason,
  ) {
    return getNativeModule().writeSyncDatabaseScheduleState(
      databasePath,
      lastSuccessfulPullAt,
      nextRetryAt,
      transientFailureCount,
      suspendedReason,
    )
  },
  markSyncDatabaseScheduleSucceeded(databasePath, completedPullAt) {
    return getNativeModule().markSyncDatabaseScheduleSucceeded(
      databasePath,
      completedPullAt,
    )
  },
  ensureSyncDatabaseDocument(databasePath, libraryUuid, replicaId, nowMs) {
    return getNativeModule().ensureSyncDatabaseDocument(
      databasePath,
      libraryUuid,
      replicaId,
      nowMs,
    )
  },
  executeSyncDatabaseCommand(
    databasePath,
    libraryUuid,
    replicaId,
    nowMs,
    commandJson,
  ) {
    return getNativeModule().executeSyncDatabaseCommand(
      databasePath,
      libraryUuid,
      replicaId,
      nowMs,
      commandJson,
    )
  },
  hasSyncDatabasePendingWork(databasePath) {
    return getNativeModule().hasSyncDatabasePendingWork(databasePath)
  },
  readSyncDatabaseDiagnostics(databasePath) {
    return getNativeModule().readSyncDatabaseDiagnostics(databasePath)
  },
  readSyncTaskProgress(taskId) {
    return getNativeModule().readSyncTaskProgress(taskId)
  },
  cancelSyncTask(taskId) {
    return getNativeModule().cancelSyncTask(taskId)
  },
  releaseSyncTask(taskId) {
    return getNativeModule().releaseSyncTask(taskId)
  },
  syncLibrarySidecar(
    taskId,
    databasePath,
    libraryUuid,
    replicaId,
    nowMs,
    mode,
    storageJson,
  ) {
    return getNativeModule().syncLibrarySidecar(
      taskId,
      databasePath,
      libraryUuid,
      replicaId,
      nowMs,
      mode,
      storageJson,
    )
  },
}

export default moduleFacade
