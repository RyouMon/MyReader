package com.myreader.rustcomponents

import com.myreader.rustcomponents.uniffi.RustComponentsException
import com.myreader.rustcomponents.uniffi.executeSyncDocumentCommand
import com.myreader.rustcomponents.uniffi.syncContractVersion
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MyReaderRustComponentsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MyReaderRustComponents")

    Function("syncContractVersion") {
      syncContractVersion().toInt()
    }

    Function("executeSyncDocumentCommand") {
        snapshotBytes: ByteArray?,
        requestJson: String,
        payloadBytes: ByteArray? ->
      try {
        val result = executeSyncDocumentCommand(
          snapshotBytes,
          requestJson,
          payloadBytes,
        )
        mapOf(
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
      } catch (error: RustComponentsException) {
        val message = when (error) {
          is RustComponentsException.Sync -> error.v1
        }
        throw CodedException("SYNC_ERROR", message, error)
      }
    }
  }
}
