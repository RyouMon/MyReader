import { requireNativeModule } from "expo"

export type NativeSyncDocumentChange = {
  actorId: string
  sequence: string
  hash: string
  bytes: Uint8Array
}

export type NativeSyncDocumentCommandResult = {
  schemaVersion: number
  libraryUuid: string | null
  snapshotBytes: Uint8Array
  heads: string[]
  incrementalBytes: Uint8Array
  changes: NativeSyncDocumentChange[]
  missingDependencies: string[]
  projectionJson: string
}

export type NativeSyncOutboxEntry = {
  objectPath: string
  bytes: Uint8Array
  sha256: string
  changeHashesJson: string
}

export type NativeSyncRemoteObject = {
  objectPath: string
  head: string
  bytes: Uint8Array
  sha256: string
}

export type NativeApplyRemoteDatabaseResult = {
  document: NativeSyncDocumentCommandResult
  appliedObjects: number
}

export type NativeSyncDatabaseDiagnostics = {
  schemaVersion: number | null
  heads: string[]
  changes: number
  pendingOutbox: number
  receipts: number
  projectionVersion: number | null
}

export type MyReaderRustComponentsModule = {
  syncContractVersion(): number
  executeSyncDocumentCommand(
    snapshotBytes: Uint8Array | null,
    requestJson: string,
    payloadBytes: Uint8Array | null,
  ): NativeSyncDocumentCommandResult
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
  listSyncDatabaseOutbox(databasePath: string): Promise<NativeSyncOutboxEntry[]>
  markSyncDatabaseOutboxPublished(
    databasePath: string,
    objectPath: string,
    publishedAt: string,
  ): Promise<void>
  hasSyncDatabaseReceipt(
    databasePath: string,
    objectPath: string,
  ): Promise<boolean>
  applySyncDatabaseRemoteObjects(
    databasePath: string,
    libraryUuid: string,
    replicaId: string,
    nowMs: string,
    objects: NativeSyncRemoteObject[],
  ): Promise<NativeApplyRemoteDatabaseResult>
  readSyncDatabaseDiagnostics(
    databasePath: string,
  ): Promise<NativeSyncDatabaseDiagnostics>
}

let nativeModule: MyReaderRustComponentsModule | null = null

function getNativeModule(): MyReaderRustComponentsModule {
  nativeModule ??= requireNativeModule<MyReaderRustComponentsModule>(
    "MyReaderRustComponents",
  )
  return nativeModule
}

const moduleFacade: MyReaderRustComponentsModule = {
  syncContractVersion() {
    return getNativeModule().syncContractVersion()
  },
  executeSyncDocumentCommand(snapshotBytes, requestJson, payloadBytes) {
    return getNativeModule().executeSyncDocumentCommand(
      snapshotBytes,
      requestJson,
      payloadBytes,
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
  listSyncDatabaseOutbox(databasePath) {
    return getNativeModule().listSyncDatabaseOutbox(databasePath)
  },
  markSyncDatabaseOutboxPublished(databasePath, objectPath, publishedAt) {
    return getNativeModule().markSyncDatabaseOutboxPublished(
      databasePath,
      objectPath,
      publishedAt,
    )
  },
  hasSyncDatabaseReceipt(databasePath, objectPath) {
    return getNativeModule().hasSyncDatabaseReceipt(databasePath, objectPath)
  },
  applySyncDatabaseRemoteObjects(
    databasePath,
    libraryUuid,
    replicaId,
    nowMs,
    objects,
  ) {
    return getNativeModule().applySyncDatabaseRemoteObjects(
      databasePath,
      libraryUuid,
      replicaId,
      nowMs,
      objects,
    )
  },
  readSyncDatabaseDiagnostics(databasePath) {
    return getNativeModule().readSyncDatabaseDiagnostics(databasePath)
  },
}

export default moduleFacade
