import { expect, it } from "vitest"
import {
  desktopResources,
  libraryLocationProblemKey,
  libraryLocationTitleKey,
} from "../src/desktop"
import { mobileResources } from "../src/mobile"
import { SUPPORTED_LANGUAGES } from "../src/languages"

it.each([
  "root_missing",
  "path_unavailable",
  "invalid_library",
  "identity_unknown",
  "identity_mismatch",
  "credential",
  "connectivity",
  "data_source",
  "busy",
  "changed",
  "managed",
  "save_failed",
])("localizes the Core location code %s consistently on both platforms", (problem) => {
  for (const locale of SUPPORTED_LANGUAGES) {
    for (const key of [
      libraryLocationProblemKey(problem),
      libraryLocationTitleKey(problem),
    ]) {
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
  "HTTP 404",
  "unknown",
])("does not infer a recovery action from arbitrary diagnostics (%s)", (value) => {
  expect(libraryLocationProblemKey(value)).toBe(
    "libraryLocation.problems.save_failed",
  )
  expect(libraryLocationTitleKey(value)).toBe("libraryLocation.title")
})
