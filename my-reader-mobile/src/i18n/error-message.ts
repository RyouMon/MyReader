import { appendErrorDetail, errorMessageKey } from "@my-reader/i18n/mobile"
import { appErrorKind } from "@/src/errors/kind"
import i18n from "@/src/i18n"

export function errorMessage(error: unknown): string {
  return appendErrorDetail(i18n.t(errorMessageKey(appErrorKind(error))), error)
}

export function describeDownloadError(error: unknown): {
  title: string
  message: string
} {
  return {
    title: i18n.t("errors.downloadFailed"),
    message: errorMessage(error),
  }
}
