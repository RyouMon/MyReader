import ExpoModulesCore

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

private func downloadTaskDictionary(_ task: NativeDownloadTask) -> [String: Any] {
  [
    "id": task.id,
    "libraryId": task.libraryId,
    "bookId": task.bookId ?? NSNull(),
    "format": task.format ?? NSNull(),
    "relativePath": task.relativePath,
    "label": task.label,
    "status": task.status,
    "progress": task.progress,
    "error": task.error ?? NSNull(),
  ]
}

public class MyReaderRustComponentsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MyReaderRustComponents")

    Function("coreContractVersion") {
      coreContractVersion()
    }

    Function("invokeCoreSync") {
      (requestJson: String) in
      try componentCall {
        try invokeCoreSync(requestJson: requestJson)
      }
    }

    AsyncFunction("invokeCoreAsync") {
      (requestJson: String) in
      try componentCall {
        try invokeCoreAsync(requestJson: requestJson)
      }
    }

    AsyncFunction("migrateLibraryDatabase") {
      (databasePath: String) in
      try componentCall {
        try migrateLibraryDatabase(databasePath: databasePath)
      }
    }

    Function("findActiveDownloadTask") {
      (libraryId: String, relativePath: String) -> [String: Any]? in
      findActiveDownloadTask(
        libraryId: libraryId,
        relativePath: relativePath
      ).map(downloadTaskDictionary)
    }

    Function("enqueueDownloadTask") {
      (
        id: String,
        libraryId: String,
        bookId: String?,
        format: String?,
        relativePath: String,
        label: String
      ) -> [String: Any] in
      let result = try componentCall {
        try enqueueDownloadTask(
          id: id,
          libraryId: libraryId,
          bookId: bookId,
          format: format,
          relativePath: relativePath,
          label: label
        )
      }
      return [
        "task": downloadTaskDictionary(result.task),
        "inserted": result.inserted,
      ]
    }

    Function("claimDownloadTasks") {
      claimDownloadTasks().map(downloadTaskDictionary)
    }

    Function("claimDownloadTask") {
      (taskId: String) -> [String: Any]? in
      claimDownloadTask(taskId: taskId).map(downloadTaskDictionary)
    }

    Function("markDownloadTaskStarted") {
      (taskId: String) -> [String: Any]? in
      markDownloadTaskStarted(taskId: taskId).map(downloadTaskDictionary)
    }

    Function("reportDownloadTaskProgress") {
      (taskId: String, received: Int64, total: Int64) -> [String: Any]? in
      reportDownloadTaskProgress(
        taskId: taskId,
        received: UInt64(clamping: received),
        total: UInt64(clamping: total)
      ).map(downloadTaskDictionary)
    }

    Function("completeDownloadTask") {
      (taskId: String) -> [String: Any]? in
      completeDownloadTask(taskId: taskId).map(downloadTaskDictionary)
    }

    Function("failDownloadTask") {
      (taskId: String, error: String) -> [String: Any]? in
      failDownloadTask(taskId: taskId, error: error).map(downloadTaskDictionary)
    }

    Function("cancelDownloadTask") {
      (taskId: String) -> Bool in
      cancelDownloadTask(taskId: taskId)
    }

    Function("listDownloadTasks") {
      listDownloadTasks().map(downloadTaskDictionary)
    }

    Function("releaseDownloadTask") {
      (taskId: String) -> Bool in
      releaseDownloadTask(taskId: taskId)
    }

    Function("clearFinishedDownloadTasks") {
      clearFinishedDownloadTasks()
    }

    Function("syncContractVersion") {
      Int(syncContractVersion())
    }

    Function("createSyncCoordinator") {
      (coordinatorId: String) -> Bool in
      createSyncCoordinator(coordinatorId: coordinatorId)
    }

    Function("requestCoordinatedSync") {
      (
        coordinatorId: String,
        libraryId: String,
        mode: String,
        reason: String,
        timing: String,
        nowMs: String
      ) -> String in
      try componentCall {
        try requestCoordinatedSync(
          coordinatorId: coordinatorId,
          libraryId: libraryId,
          mode: mode,
          reason: reason,
          timing: timing,
          nowMs: nowMs
        )
      }
    }

    Function("flushCoordinatedSync") {
      (
        coordinatorId: String,
        libraryId: String,
        reason: String,
        nowMs: String
      ) -> String in
      try componentCall {
        try flushCoordinatedSync(
          coordinatorId: coordinatorId,
          libraryId: libraryId,
          reason: reason,
          nowMs: nowMs
        )
      }
    }

    AsyncFunction("recoverCoordinatedSync") {
      (
        coordinatorId: String,
        sidecarRootPath: String,
        libraryId: String,
        nowMs: String
      ) -> String in
      try componentCall {
        try recoverCoordinatedSync(
          coordinatorId: coordinatorId,
          sidecarRootPath: sidecarRootPath,
          libraryId: libraryId,
          nowMs: nowMs
        )
      }
    }

    AsyncFunction("requestCoordinatedPull") {
      (
        coordinatorId: String,
        sidecarRootPath: String,
        libraryId: String,
        reason: String,
        nowMs: String,
        freshnessMs: String
      ) -> String in
      try componentCall {
        try requestCoordinatedPull(
          coordinatorId: coordinatorId,
          sidecarRootPath: sidecarRootPath,
          libraryId: libraryId,
          reason: reason,
          nowMs: nowMs,
          freshnessMs: freshnessMs
        )
      }
    }

    Function("beginCoordinatedSync") {
      (
        coordinatorId: String,
        libraryId: String,
        generation: Int
      ) -> String in
      try componentCall {
        try beginCoordinatedSync(
          coordinatorId: coordinatorId,
          libraryId: libraryId,
          generation: UInt64(generation)
        )
      }
    }

    AsyncFunction("effectiveCoordinatedSyncExecution") {
      (
        coordinatorId: String,
        sidecarRootPath: String,
        executionJson: String,
        nowMs: String,
        freshnessMs: String
      ) -> String? in
      try componentCall {
        try effectiveCoordinatedSyncExecution(
          coordinatorId: coordinatorId,
          sidecarRootPath: sidecarRootPath,
          executionJson: executionJson,
          nowMs: nowMs,
          freshnessMs: freshnessMs
        )
      }
    }

    Function("completeCoordinatedSync") {
      (
        coordinatorId: String,
        libraryId: String,
        nowMs: String
      ) -> String in
      try componentCall {
        try completeCoordinatedSync(
          coordinatorId: coordinatorId,
          libraryId: libraryId,
          nowMs: nowMs
        )
      }
    }

    AsyncFunction("failCoordinatedSync") {
      (
        coordinatorId: String,
        sidecarRootPath: String,
        executionJson: String,
        failureKind: String,
        reason: String,
        nowMs: String,
        randomFraction: Double
      ) -> String in
      try componentCall {
        try failCoordinatedSync(
          coordinatorId: coordinatorId,
          sidecarRootPath: sidecarRootPath,
          executionJson: executionJson,
          failureKind: failureKind,
          reason: reason,
          nowMs: nowMs,
          randomFraction: randomFraction
        )
      }
    }

    Function("setCoordinatedSyncLibraryOnline") {
      (
        coordinatorId: String,
        libraryId: String,
        online: Bool,
        nowMs: String
      ) -> String in
      try componentCall {
        try setCoordinatedSyncLibraryOnline(
          coordinatorId: coordinatorId,
          libraryId: libraryId,
          online: online,
          nowMs: nowMs
        )
      }
    }

    Function("disposeSyncCoordinator") {
      (coordinatorId: String) -> String in
      try componentCall {
        try disposeSyncCoordinator(coordinatorId: coordinatorId)
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
        sidecarRootPath: String,
        libraryRootPath: String,
        nowMs: String,
        mode: String,
        storageJson: String
      ) async throws -> [String: Any] in
      let result = try componentCall {
        try syncLibrarySidecar(
          taskId: taskId,
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
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
