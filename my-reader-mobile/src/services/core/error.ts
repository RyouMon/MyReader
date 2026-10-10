// Inspect generated error types without initializing the native module.
import { CoreFfiError } from "my-reader-core/src/generated/my_reader_core_ffi"

export function coreErrorKind(error: unknown): CoreFfiError["tag"] | undefined {
  return typeof error === "object" &&
    error !== null &&
    CoreFfiError.instanceOf(error)
    ? error.tag
    : undefined
}
