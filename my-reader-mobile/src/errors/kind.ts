import { coreErrorKind } from "@/src/services/core/error"
import {
  CredentialError,
  DataIntegrityError,
  DataSourceInUseError,
  NetworkError,
  SyncConfigError,
  SyncFailureError,
} from "./app-errors"

/** Diagnostics are never used to infer a failure or recovery category. */
export function appErrorKind(error: unknown): string | undefined {
  const coreKind = coreErrorKind(error)
  if (coreKind) return coreKind
  if (error instanceof SyncFailureError) return error.failureKind
  if (error instanceof SyncConfigError) return "Config"
  if (error instanceof CredentialError) return "Credential"
  if (error instanceof DataIntegrityError) return "DataIntegrity"
  if (error instanceof DataSourceInUseError) return "DataSourceInUse"
  if (error instanceof NetworkError) {
    if (error.statusCode === 401 || error.statusCode === 403)
      return "Credential"
    if (error.statusCode === 404) return "NotFound"
    if (
      error.statusCode === undefined ||
      error.statusCode === 408 ||
      error.statusCode === 429 ||
      error.statusCode >= 500
    )
      return "Network"
    if (error.statusCode >= 400 && error.statusCode < 500) return "Config"
  }
  return undefined
}
