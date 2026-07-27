import ExpoModulesCore

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
      do {
        let result = try executeSyncDocumentCommand(
          snapshotBytes: snapshotBytes,
          requestJson: requestJson,
          payloadBytes: payloadBytes
        )
        return [
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
  }
}
