import ExpoModulesCore

private func documentResultDictionary(
  _ result: SyncDocumentCommandResult
) -> [String: Any] {
  [
    "schemaVersion": Int(result.schemaVersion),
    "heads": result.heads,
    "projectionJson": result.projectionJson,
  ]
}

private func componentCall<T>(_ operation: () throws -> T) throws -> T {
  do {
    return try operation()
  } catch let RustComponentsError.Core(message) {
    throw Exception(
      name: "RustComponentException",
      description: message,
      code: "CORE_ERROR"
    )
  } catch let RustComponentsError.Sync(message) {
    throw Exception(
      name: "SyncComponentException",
      description: message,
      code: "SYNC_ERROR"
    )
  } catch {
    throw Exception(
      name: "SyncComponentException",
      description: error.localizedDescription,
      code: "SYNC_ERROR"
    )
  }
}

public class MyReaderRustComponentsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MyReaderRustComponents")

    AsyncFunction("migrateLibraryDatabase") {
      (databasePath: String) in
      try componentCall {
        try migrateLibraryDatabase(databasePath: databasePath)
      }
    }

    Function("syncContractVersion") {
      Int(syncContractVersion())
    }

    Function("advanceSyncScheduler") {
      (
        stateJson: String?,
        policyJson: String,
        eventJson: String
      ) -> String in
      try componentCall {
        try advanceSyncScheduler(
          stateJson: stateJson,
          policyJson: policyJson,
          eventJson: eventJson
        )
      }
    }

    AsyncFunction("ensureSyncDatabaseIdentity") {
      (
        databasePath: String,
        libraryUuid: String
      ) -> [String: Any] in
      try componentCall {
        let identity = try ensureSyncDatabaseIdentity(
          databasePath: databasePath,
          libraryUuid: libraryUuid
        )
        return [
          "libraryUuid": identity.libraryUuid,
          "replicaId": identity.replicaId,
        ]
      }
    }

    AsyncFunction("readSyncDatabaseScheduleState") {
      (databasePath: String) -> [String: Any]? in
      try componentCall {
        guard let state = try readSyncDatabaseScheduleState(databasePath: databasePath) else {
          return nil
        }
        return [
          "lastSuccessfulPullAt": state.lastSuccessfulPullAt ?? NSNull(),
          "nextRetryAt": state.nextRetryAt ?? NSNull(),
          "transientFailureCount": Int(state.transientFailureCount),
          "suspendedReason": state.suspendedReason ?? NSNull(),
        ]
      }
    }

    AsyncFunction("writeSyncDatabaseScheduleState") {
      (
        databasePath: String,
        lastSuccessfulPullAt: Int64?,
        nextRetryAt: Int64?,
        transientFailureCount: UInt32,
        suspendedReason: String?
      ) in
      try componentCall {
        try writeSyncDatabaseScheduleState(
          databasePath: databasePath,
          state: SyncDatabaseScheduleState(
            lastSuccessfulPullAt: lastSuccessfulPullAt,
            nextRetryAt: nextRetryAt,
            transientFailureCount: transientFailureCount,
            suspendedReason: suspendedReason
          )
        )
      }
    }

    AsyncFunction("markSyncDatabaseScheduleSucceeded") {
      (
        databasePath: String,
        completedPullAt: Int64?
      ) in
      try componentCall {
        try markSyncDatabaseScheduleSucceeded(
          databasePath: databasePath,
          completedPullAt: completedPullAt
        )
      }
    }

    AsyncFunction("ensureSyncDatabaseDocument") {
      (
        databasePath: String,
        libraryUuid: String,
        replicaId: String,
        nowMs: String
      ) -> [String: Any] in
      try componentCall {
        documentResultDictionary(try ensureSyncDatabaseDocument(
          databasePath: databasePath,
          libraryUuid: libraryUuid,
          replicaId: replicaId,
          nowMs: nowMs
        ))
      }
    }

    AsyncFunction("executeSyncDatabaseCommand") {
      (
        databasePath: String,
        libraryUuid: String,
        replicaId: String,
        nowMs: String,
        commandJson: String
      ) -> [String: Any] in
      try componentCall {
        documentResultDictionary(try executeSyncDatabaseCommand(
          databasePath: databasePath,
          libraryUuid: libraryUuid,
          replicaId: replicaId,
          nowMs: nowMs,
          commandJson: commandJson
        ))
      }
    }

    AsyncFunction("hasSyncDatabasePendingWork") {
      (databasePath: String) -> Bool in
      try componentCall {
        try hasSyncDatabasePendingWork(databasePath: databasePath)
      }
    }

    AsyncFunction("readSyncDatabaseDiagnostics") {
      (databasePath: String) -> [String: Any] in
      try componentCall {
        let result = try readSyncDatabaseDiagnostics(databasePath: databasePath)
        return [
          "schemaVersion": result.schemaVersion ?? NSNull(),
          "heads": result.heads,
          "changes": result.changes,
          "pendingOutbox": result.pendingOutbox,
          "receipts": result.receipts,
          "projectionVersion": result.projectionVersion ?? NSNull(),
        ]
      }
    }

    Function("readSyncTaskProgress") {
      (taskId: String) -> [String: Any]? in
      guard let progress = readSyncTaskProgress(taskId: taskId) else {
        return nil
      }
      return [
        "taskId": progress.taskId,
        "stage": progress.stage,
        "completed": Int(progress.completed),
        "total": Int(progress.total),
      ]
    }

    Function("cancelSyncTask") {
      (taskId: String) -> Bool in
      cancelSyncTask(taskId: taskId)
    }

    Function("releaseSyncTask") {
      (taskId: String) -> Bool in
      releaseSyncTask(taskId: taskId)
    }

    AsyncFunction("syncLibrarySidecar") {
      (
        taskId: String,
        databasePath: String,
        libraryUuid: String,
        replicaId: String,
        nowMs: String,
        mode: String,
        storageJson: String
      ) async throws -> [String: Any] in
      let result = try componentCall {
        try syncLibrarySidecar(
          taskId: taskId,
          databasePath: databasePath,
          libraryUuid: libraryUuid,
          replicaId: replicaId,
          nowMs: nowMs,
          mode: mode,
          storageJson: storageJson
        )
      }
      return [
        "pushed": Int(result.pushed),
        "pulled": Int(result.pulled),
      ]
    }
  }
}
