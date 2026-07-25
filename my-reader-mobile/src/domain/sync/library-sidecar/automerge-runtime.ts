import { UseApi } from "@automerge/automerge/slim"
import { nativeApi } from "@my-reader/automerge-native"

let initialized = false

export function initializeLibrarySidecarAutomerge(): Promise<void> {
  if (!initialized) {
    UseApi(nativeApi as unknown as Parameters<typeof UseApi>[0])
    initialized = true
  }
  return Promise.resolve()
}
