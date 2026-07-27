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

export type MyReaderRustComponentsModule = {
  syncContractVersion(): number
  executeSyncDocumentCommand(
    snapshotBytes: Uint8Array | null,
    requestJson: string,
    payloadBytes: Uint8Array | null,
  ): NativeSyncDocumentCommandResult
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
}

export default moduleFacade
