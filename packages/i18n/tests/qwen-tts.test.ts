import { describe, expect, it } from "vitest"
import { desktopResources, qwenTtsSourceKeys } from "../src/desktop"
import { mobileResources } from "../src/mobile"

describe("Qwen source copy", () => {
  it.each([
    "tokenPlan",
    "qianwen",
    "dashscope",
    "custom",
  ])("provides localized source labels and credential hints for %s on both platforms", (id) => {
    for (const locale of ["zh-CN", "en"] as const) {
      for (const key of Object.values(qwenTtsSourceKeys(id))) {
        const resolve = (tree: unknown) =>
          key
            .split(".")
            .reduce<unknown>(
              (value, segment) => (value as Record<string, unknown>)[segment],
              tree,
            )
        const desktop = resolve(desktopResources[locale].translation)
        expect(desktop).toBeTypeOf("string")
        expect(resolve(mobileResources[locale].translation)).toEqual(desktop)
      }
    }
  })
})
