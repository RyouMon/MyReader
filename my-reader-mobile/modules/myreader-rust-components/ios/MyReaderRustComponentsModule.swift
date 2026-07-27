import ExpoModulesCore

struct SyncRemoteObjectRecord: Record {
  @Field var objectPath: String = ""
  @Field var head: String = ""
  @Field var bytes: Data = Data()
  @Field var sha256: String = ""
}

private func documentResultDictionary(
  _ result: SyncDocumentCommandResult
) -> [String: Any] {
  [
    "schemaVersion": Int(result.schemaVersion),
    "libraryUuid": result.libraryUuid ?? NSNull(),
    "snapshotBytes": result.snapshotBytes,
    "heads": result.heads,
    "incrementalBytes": result.incrementalBytes,
    "changes": result.changes.map { change in
      [
        "actorId": change.actorId,
        "sequence": change.sequence,
        "hash": change.hash,
        "bytes": change.bytes,
      ]
    },
    "missingDependencies": result.missingDependencies,
    "projectionJson": result.projectionJson,
  ]
}

private func syncCall<T>(_ operation: () throws -> T) throws -> T {
  do {
    return try operation()
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

private func syncAsyncCall<T>(_ operation: () async throws -> T) async throws -> T {
  do {
    return try await operation()
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

    Function("syncContractVersion") {
      Int(syncContractVersion())
    }

    Function("executeSyncDocumentCommand") {
      (
        snapshotBytes: Data?,
        requestJson: String,
        payloadBytes: Data?
      ) -> [String: Any] in
      try syncCall {
        let result = try executeSyncDocumentCommand(
          snapshotBytes: snapshotBytes,
          requestJson: requestJson,
          payloadBytes: payloadBytes
        )
        return documentResultDictionary(result)
      }
    }

    AsyncFunction("ensureSyncDatabaseDocument") {
      (
        databasePath: String,
        libraryUuid: String,
        replicaId: String,
        nowMs: String
      ) -> [String: Any] in
      try syncCall {
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
      try syncCall {
        documentResultDictionary(try executeSyncDatabaseCommand(
          databasePath: databasePath,
          libraryUuid: libraryUuid,
          replicaId: replicaId,
          nowMs: nowMs,
          commandJson: commandJson
        ))
      }
    }

    AsyncFunction("listSyncDatabaseOutbox") {
      (databasePath: String) -> [[String: Any]] in
      try syncCall {
        try listSyncDatabaseOutbox(databasePath: databasePath).map { entry in
          [
            "objectPath": entry.objectPath,
            "bytes": entry.bytes,
            "sha256": entry.sha256,
            "changeHashesJson": entry.changeHashesJson,
          ]
        }
      }
    }

    AsyncFunction("markSyncDatabaseOutboxPublished") {
      (databasePath: String, objectPath: String, publishedAt: String) in
      try syncCall {
        try markSyncDatabaseOutboxPublished(
          databasePath: databasePath,
          objectPath: objectPath,
          publishedAt: publishedAt
        )
      }
    }

    AsyncFunction("hasSyncDatabaseReceipt") {
      (databasePath: String, objectPath: String) -> Bool in
      try syncCall {
        try hasSyncDatabaseReceipt(
          databasePath: databasePath,
          objectPath: objectPath
        )
      }
    }

    AsyncFunction("applySyncDatabaseRemoteObjects") {
      (
        databasePath: String,
        libraryUuid: String,
        replicaId: String,
        nowMs: String,
        objects: [SyncRemoteObjectRecord]
      ) -> [String: Any] in
      try syncCall {
        let result = try applySyncDatabaseRemoteObjects(
          databasePath: databasePath,
          libraryUuid: libraryUuid,
          replicaId: replicaId,
          nowMs: nowMs,
          objects: objects.map { object in
            SyncRemoteObject(
              objectPath: object.objectPath,
              head: object.head,
              bytes: object.bytes,
              sha256: object.sha256
            )
          }
        )
        return [
          "document": documentResultDictionary(result.document),
          "appliedObjects": Int(result.appliedObjects),
        ]
      }
    }

    AsyncFunction("readSyncDatabaseDiagnostics") {
      (databasePath: String) -> [String: Any] in
      try syncCall {
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

    AsyncFunction("syncLibrarySidecar") {
      (
        databasePath: String,
        libraryUuid: String,
        replicaId: String,
        nowMs: String,
        mode: String,
        storageJson: String
      ) async throws -> [String: Any] in
      let result = try await syncAsyncCall {
        try await syncLibrarySidecar(
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
