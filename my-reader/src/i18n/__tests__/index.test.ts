import { createInstance } from "i18next"
import { describe, expect, it } from "vitest"
import i18n from ".."

describe("translation fallback", () => {
  it("falls back to English for missing and empty translations", async () => {
    const instance = createInstance()
    await instance.init({
      ...i18n.options,
      lng: "ru",
      resources: {
        en: { translation: { common: { close: "Close", save: "Save" } } },
        ru: { translation: { common: { save: "" } } },
      },
    })
    expect(instance.t("common.close")).toBe("Close")
    expect(instance.t("common.save")).toBe("Save")
  })
})
