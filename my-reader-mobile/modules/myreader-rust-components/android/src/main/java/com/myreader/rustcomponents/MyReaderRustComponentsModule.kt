package com.myreader.rustcomponents

import com.myreader.rustcomponents.uniffi.RustComponentsException
import com.myreader.rustcomponents.uniffi.SyncDocumentCommandResult
import com.myreader.rustcomponents.uniffi.advanceSyncScheduler
import com.myreader.rustcomponents.uniffi.cancelSyncTask
import com.myreader.rustcomponents.uniffi.ensureSyncDatabaseIdentity
import com.myreader.rustcomponents.uniffi.ensureSyncDatabaseDocument
import com.myreader.rustcomponents.uniffi.executeSyncDatabaseCommand
import com.myreader.rustcomponents.uniffi.hasSyncDatabasePendingWork
import com.myreader.rustcomponents.uniffi.markSyncDatabaseScheduleSucceeded
import com.myreader.rustcomponents.uniffi.readSyncDatabaseDiagnostics
import com.myreader.rustcomponents.uniffi.readSyncDatabaseScheduleState
import com.myreader.rustcomponents.uniffi.readSyncTaskProgress
import com.myreader.rustcomponents.uniffi.releaseSyncTask
import com.myreader.rustcomponents.uniffi.SyncDatabaseScheduleState
import com.myreader.rustcomponents.uniffi.syncContractVersion
import com.myreader.rustcomponents.uniffi.syncLibrarySidecar
import com.myreader.rustcomponents.uniffi.writeSyncDatabaseScheduleState
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MyReaderRustComponentsModule : Module() {
  private fun <T> syncCall(operation: () -> T): T = try {
    operation()
  } catch (error: RustComponentsException) {
    val message = when (error) {
      is RustComponentsException.Sync -> error.v1
    }
    throw CodedException("SYNC_ERROR", message, error)
  }

  private fun documentResult(result: SyncDocumentCommandResult) = mapOf(
    "schemaVersion" to result.schemaVersion.toInt(),
    "heads" to result.heads,
    "projectionJson" to result.projectionJson,
  )

  override fun definition() = ModuleDefinition {
    Name("MyReaderRustComponents")

    Function("syncContractVersion") {
      syncContractVersion().toInt()
    }

    Function("advanceSyncScheduler") {
        stateJson: String?,
        policyJson: String,
        eventJson: String ->
      syncCall {
        advanceSyncScheduler(stateJson, policyJson, eventJson)
      }
    }

    AsyncFunction("ensureSyncDatabaseIdentity") {
        databasePath: String,
        libraryUuid: String ->
      syncCall {
        val identity = ensureSyncDatabaseIdentity(databasePath, libraryUuid)
        mapOf(
          "libraryUuid" to identity.libraryUuid,
          "replicaId" to identity.replicaId,
        )
      }
    }

    AsyncFunction("readSyncDatabaseScheduleState") { databasePath: String ->
      syncCall {
        readSyncDatabaseScheduleState(databasePath)?.let { state ->
          mapOf(
            "lastSuccessfulPullAt" to state.lastSuccessfulPullAt,
            "nextRetryAt" to state.nextRetryAt,
            "transientFailureCount" to state.transientFailureCount.toInt(),
            "suspendedReason" to state.suspendedReason,
          )
        }
      }
    }

    AsyncFunction("writeSyncDatabaseScheduleState") {
        databasePath: String,
        lastSuccessfulPullAt: Long?,
        nextRetryAt: Long?,
        transientFailureCount: Int,
        suspendedReason: String? ->
      syncCall {
        writeSyncDatabaseScheduleState(
          databasePath,
          SyncDatabaseScheduleState(
            lastSuccessfulPullAt,
            nextRetryAt,
            transientFailureCount.toUInt(),
            suspendedReason,
          ),
        )
      }
    }

    AsyncFunction("markSyncDatabaseScheduleSucceeded") {
        databasePath: String,
        completedPullAt: Long? ->
      syncCall {
        markSyncDatabaseScheduleSucceeded(databasePath, completedPullAt)
      }
    }

    AsyncFunction("ensureSyncDatabaseDocument") {
        databasePath: String,
        libraryUuid: String,
        replicaId: String,
        nowMs: String ->
      syncCall {
        documentResult(
        ensureSyncDatabaseDocument(databasePath, libraryUuid, replicaId, nowMs),
      )
      }
    }

    AsyncFunction("executeSyncDatabaseCommand") {
        databasePath: String,
        libraryUuid: String,
        replicaId: String,
        nowMs: String,
        commandJson: String ->
      syncCall {
        documentResult(
        executeSyncDatabaseCommand(
          databasePath,
          libraryUuid,
          replicaId,
          nowMs,
          commandJson,
        ),
      )
      }
    }

    AsyncFunction("hasSyncDatabasePendingWork") { databasePath: String ->
      syncCall {
        hasSyncDatabasePendingWork(databasePath)
      }
    }

    AsyncFunction("readSyncDatabaseDiagnostics") { databasePath: String ->
      syncCall {
        val result = readSyncDatabaseDiagnostics(databasePath)
        mapOf(
          "schemaVersion" to result.schemaVersion,
          "heads" to result.heads,
          "changes" to result.changes,
          "pendingOutbox" to result.pendingOutbox,
          "receipts" to result.receipts,
          "projectionVersion" to result.projectionVersion,
        )
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
        databasePath: String,
        libraryUuid: String,
        replicaId: String,
        nowMs: String,
        mode: String,
        storageJson: String ->
      syncCall {
        val result = syncLibrarySidecar(
          taskId,
          databasePath,
          libraryUuid,
          replicaId,
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
