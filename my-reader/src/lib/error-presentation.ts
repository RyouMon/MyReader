import { errorMessageKey } from "@my-reader/i18n/desktop"
import i18n from "@/i18n"
import { apiErrorKind } from "./api-error"

/** Translate at the UI boundary; retain the original error for logs and recovery. */
export function errorMessage(error: unknown): string {
  return i18n.t(errorMessageKey(apiErrorKind(error)))
}
