import { describe, expect, it } from "vitest"
import { errorMessageKey, desktopResources } from "../src/desktop"
import { mobileResources } from "../src/mobile"

describe("operation error copy", () => {
  it("selects copy from categories and safely handles untrusted or old kinds", () => {
    expect(errorMessageKey("Credential")).toBe("operationError.credential")
    expect(errorMessageKey("Request")).toBe("operationError.connectivity")
    for (const kind of [
      undefined,
      "IO_ERROR: /private/book",
      "__proto__",
      "toString",
    ]) {
      expect(errorMessageKey(kind)).toBe("operationError.unexpected")
    }
  })

  it("provides all error categories in every desktop and mobile language", () => {
    const keys = Object.keys(desktopResources.en.translation.operationError)
    for (const resources of [desktopResources, mobileResources]) {
      for (const { translation } of Object.values(resources)) {
        expect(Object.keys(translation.operationError)).toEqual(keys)
        for (const value of Object.values(translation.operationError)) {
          expect(value).toEqual(expect.any(String))
          expect(value).toEqual(expect.stringMatching(/\S/))
        }
      }
    }
  })
})
