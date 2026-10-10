import { CoreFfiError } from "my-reader-core/src/generated/my_reader_core_ffi"
import { NetworkError } from "@/src/errors"
import { classifySyncFailure } from "@/src/domain/sync/failure"
import i18n from "@/src/i18n"
import { errorMessage, describeDownloadError } from "./error-message"

beforeEach(async () => {
  await i18n.changeLanguage("en")
})
afterEach(async () => {
  await i18n.changeLanguage("en")
})

it("appends diagnostics without using misleading text for recovery policy", () => {
  const diagnostic = "credential 401 network timeout /private/library"
  expect(classifySyncFailure(new Error(diagnostic))).toBe("unexpected")
  expect(errorMessage(new Error(diagnostic))).toBe(
    `${i18n.t("operationError.unexpected")}\nError: ${diagnostic}`,
  )
  expect(errorMessage(new CoreFfiError.Credential(diagnostic))).toBe(
    `${i18n.t("operationError.credential")}\nCredential: CoreFfiError.Credential: ${diagnostic}`,
  )
  expect(classifySyncFailure(new NetworkError(diagnostic, 403))).toBe(
    "credential",
  )
  expect(classifySyncFailure(new NetworkError(diagnostic, 503))).toBe(
    "connectivity",
  )
})

it("translates the same download failure in the current language at presentation time", async () => {
  const error = new NetworkError("raw HTTP 404", 404)
  expect(describeDownloadError(error).message).toBe(
    `${i18n.t("operationError.notFound")}\nNetworkError: raw HTTP 404`,
  )
  await i18n.changeLanguage("zh-CN")
  expect(describeDownloadError(error)).toEqual({
    title: i18n.t("errors.downloadFailed"),
    message: "此项目已不可用，请刷新后重试。\nNetworkError: raw HTTP 404",
  })
})
