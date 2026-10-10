import { describe, expect, it } from "vitest"
import {
  desktopResources,
  syncFailureDetail,
  syncFailureKeys,
} from "../src/desktop"
import { SUPPORTED_LANGUAGES } from "../src/languages"
import { mobileResources } from "../src/mobile"

describe("sync failure copy", () => {
  it("appends the stored category and original message without translating diagnostics", () => {
    const failure = {
      failureKind: "credential",
      message: "STORAGE_ERROR: PermissionDenied\nHTTP 401 /Books",
    }
    expect(syncFailureDetail("请检查凭据。", failure)).toBe(
      "请检查凭据。\ncredential: STORAGE_ERROR: PermissionDenied\nHTTP 401 /Books",
    )
    expect(syncFailureDetail("Check credentials.", failure)).toBe(
      "Check credentials.\ncredential: STORAGE_ERROR: PermissionDenied\nHTTP 401 /Books",
    )
  })

  it("preserves legacy messages and omits absent diagnostics", () => {
    expect(
      syncFailureDetail("Try again.", { message: "IO_ERROR: offline" }),
    ).toBe("Try again.\nIO_ERROR: offline")
    expect(
      syncFailureDetail("Try again.", { failureKind: "future_kind" }),
    ).toBe("Try again.\nfuture_kind")
    expect(syncFailureDetail("Try again.", undefined)).toBe("Try again.")
    expect(syncFailureDetail("Try again.", { message: "" })).toBe("Try again.")
  })

  it.each([
    "connectivity",
    "credential",
    "configuration",
    "data_integrity",
    "unexpected",
  ])("provides the same localized explanation for %s on both platforms", (kind) => {
    for (const locale of SUPPORTED_LANGUAGES) {
      for (const key of Object.values(syncFailureKeys(kind))) {
        const resolve = (tree: unknown) =>
          key
            .split(".")
            .reduce<unknown>(
              (value, segment) => (value as Record<string, unknown>)[segment],
              tree,
            )
        const desktop = resolve(desktopResources[locale].translation)
        expect(desktop).toBeTypeOf("string")
        expect(desktop).not.toBe("")
        expect(resolve(mobileResources[locale].translation)).toEqual(desktop)
      }
    }
  })

  it.each([
    undefined,
    null,
    "",
    "future_kind",
    "credential network 503",
  ])("uses generic copy for an unknown or missing category (%s)", (kind) => {
    expect(syncFailureKeys(kind)).toEqual({
      title: "syncStatus.failure.unexpected.title",
      detail: "syncStatus.failure.unexpected.detail",
    })
  })
})
