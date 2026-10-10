import { classifySyncFailure } from "@/src/domain/sync/failure"
import { nativeTransferError } from "./transfer-error"

it("uses native codes for cancellation and recovery, preserving native details", () => {
  const diagnostic = "cancel credential 401 network timeout"
  expect(nativeTransferError(diagnostic, -999).name).toBe("AbortError")
  expect(nativeTransferError(diagnostic, 0).name).not.toBe("AbortError")
  expect(classifySyncFailure(nativeTransferError(diagnostic, 0))).toBe(
    "unexpected",
  )
  expect(classifySyncFailure(nativeTransferError(diagnostic, 401))).toBe(
    "credential",
  )
  expect(classifySyncFailure(nativeTransferError(diagnostic, -1001))).toBe(
    "connectivity",
  )
  expect(nativeTransferError(diagnostic, 403).cause).toEqual({
    message: diagnostic,
    errorCode: 403,
  })
})
