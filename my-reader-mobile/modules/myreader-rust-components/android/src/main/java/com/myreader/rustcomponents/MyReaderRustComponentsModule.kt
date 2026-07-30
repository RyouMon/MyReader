package com.myreader.rustcomponents

import com.myreader.rustcomponents.uniffi.NativeDownloadTask
import com.myreader.rustcomponents.uniffi.RustComponentsException
import com.myreader.rustcomponents.uniffi.beginCoordinatedSync
import com.myreader.rustcomponents.uniffi.cancelDownloadTask
import com.myreader.rustcomponents.uniffi.cancelSyncTask
import com.myreader.rustcomponents.uniffi.claimDownloadTask
import com.myreader.rustcomponents.uniffi.claimDownloadTasks
import com.myreader.rustcomponents.uniffi.clearFinishedDownloadTasks
import com.myreader.rustcomponents.uniffi.completeCoordinatedSync
import com.myreader.rustcomponents.uniffi.completeDownloadTask
import com.myreader.rustcomponents.uniffi.coreContractVersion
import com.myreader.rustcomponents.uniffi.createSyncCoordinator
import com.myreader.rustcomponents.uniffi.disposeSyncCoordinator
import com.myreader.rustcomponents.uniffi.effectiveCoordinatedSyncExecution
import com.myreader.rustcomponents.uniffi.enqueueDownloadTask
import com.myreader.rustcomponents.uniffi.failCoordinatedSync
import com.myreader.rustcomponents.uniffi.failDownloadTask
import com.myreader.rustcomponents.uniffi.findActiveDownloadTask
import com.myreader.rustcomponents.uniffi.flushCoordinatedSync
import com.myreader.rustcomponents.uniffi.invokeCoreAsync
import com.myreader.rustcomponents.uniffi.invokeCoreSync
import com.myreader.rustcomponents.uniffi.listDownloadTasks
import com.myreader.rustcomponents.uniffi.markDownloadTaskStarted
import com.myreader.rustcomponents.uniffi.migrateLibraryDatabase
import com.myreader.rustcomponents.uniffi.readSyncTaskProgress
import com.myreader.rustcomponents.uniffi.recoverCoordinatedSync
import com.myreader.rustcomponents.uniffi.releaseDownloadTask
import com.myreader.rustcomponents.uniffi.releaseSyncTask
import com.myreader.rustcomponents.uniffi.reportDownloadTaskProgress
import com.myreader.rustcomponents.uniffi.requestCoordinatedPull
import com.myreader.rustcomponents.uniffi.requestCoordinatedSync
import com.myreader.rustcomponents.uniffi.setCoordinatedSyncLibraryOnline
import com.myreader.rustcomponents.uniffi.syncContractVersion
import com.myreader.rustcomponents.uniffi.syncLibrarySidecar
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.modules.ModuleDefinitionBuilder

class MyReaderRustComponentsModule : Module() {
  private fun downloadTaskMap(task: NativeDownloadTask): Map<String, Any?> = mapOf(
    "id" to task.id,
    "libraryId" to task.libraryId,
    "bookId" to task.bookId,
    "format" to task.format,
    "relativePath" to task.relativePath,
    "label" to task.label,
    "status" to task.status,
    "progress" to task.progress,
    "error" to task.error,
  )

  private fun <T> componentCall(operation: () -> T): T = try {
    operation()
  } catch (error: RustComponentsException) {
    when (error) {
      is RustComponentsException.Core ->
        throw CodedException("CORE_ERROR", error.v1, error)
      is RustComponentsException.Sync ->
        throw CodedException("SYNC_ERROR", error.v1, error)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("MyReaderRustComponents")
    defineTransportFunctions()
    defineDatabaseFunctions()
    defineDownloadFunctions()
    defineSyncFunctions()
  }

  private fun ModuleDefinitionBuilder.defineTransportFunctions() {
    Function("coreContractVersion") {
      coreContractVersion()
    }
    Function("invokeCoreSync") { requestJson: String ->
      componentCall {
        invokeCoreSync(requestJson)
      }
    }
    AsyncFunction("invokeCoreAsync") { requestJson: String ->
      componentCall {
        invokeCoreAsync(requestJson)
      }
    }
  }

  private fun ModuleDefinitionBuilder.defineDatabaseFunctions() {
    AsyncFunction("migrateLibraryDatabase") { databasePath: String ->
      componentCall {
        migrateLibraryDatabase(databasePath)
      }
    }
  }

  private fun ModuleDefinitionBuilder.defineDownloadFunctions() {
    Function("findActiveDownloadTask") {
        libraryId: String,
        relativePath: String ->
      findActiveDownloadTask(libraryId, relativePath)?.let(::downloadTaskMap)
    }

    Function("enqueueDownloadTask") {
        id: String,
        libraryId: String,
        bookId: String?,
        format: String?,
        relativePath: String,
        label: String ->
      componentCall {
        val result = enqueueDownloadTask(
          id,
          libraryId,
          bookId,
          format,
          relativePath,
          label,
        )
        mapOf(
          "task" to downloadTaskMap(result.task),
          "inserted" to result.inserted,
        )
      }
    }

    Function("claimDownloadTasks") {
      claimDownloadTasks().map(::downloadTaskMap)
    }

    Function("claimDownloadTask") { taskId: String ->
      claimDownloadTask(taskId)?.let(::downloadTaskMap)
    }

    Function("markDownloadTaskStarted") { taskId: String ->
      markDownloadTaskStarted(taskId)?.let(::downloadTaskMap)
    }

    Function("reportDownloadTaskProgress") {
        taskId: String,
        received: Long,
        total: Long ->
      reportDownloadTaskProgress(
        taskId,
        received.coerceAtLeast(0).toULong(),
        total.coerceAtLeast(0).toULong(),
      )?.let(::downloadTaskMap)
    }

    Function("completeDownloadTask") { taskId: String ->
      completeDownloadTask(taskId)?.let(::downloadTaskMap)
    }

    Function("failDownloadTask") { taskId: String, error: String ->
      failDownloadTask(taskId, error)?.let(::downloadTaskMap)
    }

    Function("cancelDownloadTask") { taskId: String ->
      cancelDownloadTask(taskId)
    }

    Function("listDownloadTasks") {
      listDownloadTasks().map(::downloadTaskMap)
    }

    Function("releaseDownloadTask") { taskId: String ->
      releaseDownloadTask(taskId)
    }

    Function("clearFinishedDownloadTasks") {
      clearFinishedDownloadTasks()
    }
  }

  private fun ModuleDefinitionBuilder.defineSyncFunctions() {
    Function("syncContractVersion") {
      syncContractVersion().toInt()
    }

    Function("createSyncCoordinator") { coordinatorId: String ->
      createSyncCoordinator(coordinatorId)
    }

    Function("requestCoordinatedSync") {
        coordinatorId: String,
        libraryId: String,
        mode: String,
        reason: String,
        timing: String,
        nowMs: String ->
      componentCall {
        requestCoordinatedSync(
          coordinatorId,
          libraryId,
          mode,
          reason,
          timing,
          nowMs,
        )
      }
    }

    Function("flushCoordinatedSync") {
        coordinatorId: String,
        libraryId: String,
        reason: String,
        nowMs: String ->
      componentCall {
        flushCoordinatedSync(coordinatorId, libraryId, reason, nowMs)
      }
    }

    AsyncFunction("recoverCoordinatedSync") {
        coordinatorId: String,
        sidecarRootPath: String,
        libraryId: String,
        nowMs: String ->
      componentCall {
        recoverCoordinatedSync(
          coordinatorId,
          sidecarRootPath,
          libraryId,
          nowMs,
        )
      }
    }

    AsyncFunction("requestCoordinatedPull") {
        coordinatorId: String,
        sidecarRootPath: String,
        libraryId: String,
        reason: String,
        nowMs: String,
        freshnessMs: String ->
      componentCall {
        requestCoordinatedPull(
          coordinatorId,
          sidecarRootPath,
          libraryId,
          reason,
          nowMs,
          freshnessMs,
        )
      }
    }

    Function("beginCoordinatedSync") {
        coordinatorId: String,
        libraryId: String,
        generation: Long ->
      componentCall {
        beginCoordinatedSync(coordinatorId, libraryId, generation.toULong())
      }
    }

    AsyncFunction("effectiveCoordinatedSyncExecution") {
        coordinatorId: String,
        sidecarRootPath: String,
        executionJson: String,
        nowMs: String,
        freshnessMs: String ->
      componentCall {
        effectiveCoordinatedSyncExecution(
          coordinatorId,
          sidecarRootPath,
          executionJson,
          nowMs,
          freshnessMs,
        )
      }
    }

    Function("completeCoordinatedSync") {
        coordinatorId: String,
        libraryId: String,
        nowMs: String ->
      componentCall {
        completeCoordinatedSync(coordinatorId, libraryId, nowMs)
      }
    }

    AsyncFunction("failCoordinatedSync") {
        coordinatorId: String,
        sidecarRootPath: String,
        executionJson: String,
        failureKind: String,
        reason: String,
        nowMs: String,
        randomFraction: Double ->
      componentCall {
        failCoordinatedSync(
          coordinatorId,
          sidecarRootPath,
          executionJson,
          failureKind,
          reason,
          nowMs,
          randomFraction,
        )
      }
    }

    Function("setCoordinatedSyncLibraryOnline") {
        coordinatorId: String,
        libraryId: String,
        online: Boolean,
        nowMs: String ->
      componentCall {
        setCoordinatedSyncLibraryOnline(
          coordinatorId,
          libraryId,
          online,
          nowMs,
        )
      }
    }

    Function("disposeSyncCoordinator") { coordinatorId: String ->
      componentCall {
        disposeSyncCoordinator(coordinatorId)
      }
    }

    Function("readSyncTaskProgress") { taskId: String ->
      readSyncTaskProgress(taskId)?.let { progress ->
        mapOf(
          "taskId" to progress.taskId,
          "stage" to progress.stage,
          "completed" to progress.completed.toInt(),
          "total" to progress.total.toInt(),
        )
      }
    }

    Function("cancelSyncTask") { taskId: String ->
      cancelSyncTask(taskId)
    }

    Function("releaseSyncTask") { taskId: String ->
      releaseSyncTask(taskId)
    }

    AsyncFunction("syncLibrarySidecar") {
        taskId: String,
        sidecarRootPath: String,
        libraryRootPath: String,
        nowMs: String,
        mode: String,
        storageJson: String ->
      componentCall {
        val result = syncLibrarySidecar(
          taskId,
          sidecarRootPath,
          libraryRootPath,
          nowMs,
          mode,
          storageJson,
        )
        mapOf(
          "pushed" to result.pushed.toInt(),
          "pulled" to result.pulled.toInt(),
        )
      }
    }
  }
}
