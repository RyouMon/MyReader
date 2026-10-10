import { describe, expect, it } from "vitest"
import { desktopResources, syncFailureKeys } from "../src/desktop"
import { SUPPORTED_LANGUAGES } from "../src/languages"
import { mobileResources } from "../src/mobile"

describe("sync failure copy", () => {
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
