import { AppError, NetworkError } from "@/src/errors"

/** Background downloader's HTTP status and native URL error codes are data, not UI text. */
export function nativeTransferError(message: string, errorCode: number): Error {
  const cause = { message, errorCode }
  if (errorCode === -999) {
    const error = new AppError(message || "Transfer cancelled", { cause })
    error.name = "AbortError"
    return error
  }
  if (errorCode >= 400 && errorCode <= 599) {
    return new NetworkError(message || "Transfer request failed", errorCode, {
      cause,
    })
  }
  if (
    [
      -1001, -1003, -1004, -1005, -1006, -1009, -1018, -1019, -1020, -1200,
    ].includes(errorCode)
  ) {
    return new NetworkError(
      message || "Transfer connection failed",
      undefined,
      { cause },
    )
  }
  return new AppError(message || "Transfer failed", { cause })
}
