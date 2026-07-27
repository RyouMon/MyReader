package com.myreader.rustcomponents

import com.myreader.rustcomponents.uniffi.RustComponentsException
import com.myreader.rustcomponents.uniffi.SyncDocumentCommandResult
import com.myreader.rustcomponents.uniffi.SyncRemoteObject
import com.myreader.rustcomponents.uniffi.applySyncDatabaseRemoteObjects
import com.myreader.rustcomponents.uniffi.ensureSyncDatabaseDocument
import com.myreader.rustcomponents.uniffi.executeSyncDatabaseCommand
import com.myreader.rustcomponents.uniffi.executeSyncDocumentCommand
import com.myreader.rustcomponents.uniffi.hasSyncDatabaseReceipt
import com.myreader.rustcomponents.uniffi.listSyncDatabaseOutbox
import com.myreader.rustcomponents.uniffi.markSyncDatabaseOutboxPublished
import com.myreader.rustcomponents.uniffi.readSyncDatabaseDiagnostics
import com.myreader.rustcomponents.uniffi.syncContractVersion
import com.myreader.rustcomponents.uniffi.syncLibrarySidecar
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
    "libraryUuid" to result.libraryUuid,
    "snapshotBytes" to result.snapshotBytes,
    "heads" to result.heads,
    "incrementalBytes" to result.incrementalBytes,
    "changes" to result.changes.map { change ->
      mapOf(
        "actorId" to change.actorId,
        "sequence" to change.sequence,
        "hash" to change.hash,
        "bytes" to change.bytes,
      )
    },
    "missingDependencies" to result.missingDependencies,
    "projectionJson" to result.projectionJson,
  )

  private suspend fun <T> syncAsyncCall(operation: suspend () -> T): T = try {
    operation()
  } catch (error: RustComponentsException) {
    val message = when (error) {
      is RustComponentsException.Sync -> error.v1
    }
    throw CodedException("SYNC_ERROR", message, error)
  }

  override fun definition() = ModuleDefinition {
    Name("MyReaderRustComponents")

    Function("syncContractVersion") {
      syncContractVersion().toInt()
    }

    Function("executeSyncDocumentCommand") {
        snapshotBytes: ByteArray?,
        requestJson: String,
        payloadBytes: ByteArray? ->
      syncCall {
        val result = executeSyncDocumentCommand(
          snapshotBytes,
          requestJson,
          payloadBytes,
        )
        documentResult(result)
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

    AsyncFunction("listSyncDatabaseOutbox") { databasePath: String ->
      syncCall {
        listSyncDatabaseOutbox(databasePath).map { entry ->
          mapOf(
            "objectPath" to entry.objectPath,
            "bytes" to entry.bytes,
            "sha256" to entry.sha256,
            "changeHashesJson" to entry.changeHashesJson,
          )
        }
      }
    }

    AsyncFunction("markSyncDatabaseOutboxPublished") {
        databasePath: String,
        objectPath: String,
        publishedAt: String ->
      syncCall {
        markSyncDatabaseOutboxPublished(databasePath, objectPath, publishedAt)
      }
    }

    AsyncFunction("hasSyncDatabaseReceipt") {
        databasePath: String,
        objectPath: String ->
      syncCall {
        hasSyncDatabaseReceipt(databasePath, objectPath)
      }
    }

    AsyncFunction("applySyncDatabaseRemoteObjects") {
        databasePath: String,
        libraryUuid: String,
        replicaId: String,
        nowMs: String,
        objects: List<SyncRemoteObjectRecord> ->
      syncCall {
        val result = applySyncDatabaseRemoteObjects(
          databasePath,
          libraryUuid,
          replicaId,
          nowMs,
          objects.map { object ->
            SyncRemoteObject(
              objectPath = object.objectPath,
              head = object.head,
              bytes = object.bytes,
              sha256 = object.sha256,
            )
          },
        )
        mapOf(
          "document" to documentResult(result.document),
          "appliedObjects" to result.appliedObjects.toInt(),
        )
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

    AsyncFunction("syncLibrarySidecar") {
        databasePath: String,
        libraryUuid: String,
        replicaId: String,
        nowMs: String,
        mode: String,
        storageJson: String ->
      syncAsyncCall {
        val result = syncLibrarySidecar(
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
