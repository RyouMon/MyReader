jest.mock("my-reader-core", () => ({
  CoreFfiError: jest.requireActual(
    "../../../modules/my-reader-core/src/generated/my_reader_core_ffi",
  ).CoreFfiError,
}))

import { CoreFfiError } from "my-reader-core"
import { classifySyncFailure } from "@/src/domain/sync/failure"
import { coreSyncError } from "./sync-error"

describe("native sync exceptions", () => {
  it.each([
    ["Core", "unexpected"],
    ["Sync", "unexpected"],
    ["DataIntegrity", "data_integrity"],
    ["Io", "unexpected"],
    ["Database", "unexpected"],
    ["Config", "configuration"],
    ["NotFound", "configuration"],
    ["Serialize", "unexpected"],
    ["Storage", "connectivity"],
    ["Tts", "unexpected"],
    ["Credential", "credential"],
    ["Request", "connectivity"],
  ] as const)("should retain %s recovery semantics and diagnostics", (kind, expected) => {
    const nativeError = new CoreFfiError[kind](
      "network credential 503 diagnostic",
    )
    const error = coreSyncError(nativeError)

    expect(classifySyncFailure(nativeError)).toBe(expected)
    expect(classifySyncFailure(error)).toBe(expected)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe(nativeError.message)
    expect((error as Error).cause).toBe(nativeError)
  })

  it.each([
    null,
    undefined,
    "platform error",
    new Error("platform error"),
  ])("should leave non-Core exceptions unchanged", (error) => {
    expect(coreSyncError(error)).toBe(error)
  })
})
