import { afterEach, describe, expect, it } from "vitest"
import i18n from "@/i18n"
import { errorMessage } from "../error-presentation"

afterEach(async () => {
  await i18n.changeLanguage("zh-CN")
})

describe("error presentation", () => {
  it("uses structured categories and never displays diagnostic text", async () => {
    await i18n.changeLanguage("en")
    const diagnostic = "401 network /private/library"
    expect(errorMessage(new Error(diagnostic))).toBe(
      i18n.t("operationError.unexpected"),
    )
    const error = Object.assign(new Error(diagnostic), { kind: "Credential" })
    expect(errorMessage(error)).toBe(i18n.t("operationError.credential"))
    await i18n.changeLanguage("zh-CN")
    expect(errorMessage(error)).toBe("访问被拒绝，请检查凭据或重新登录。")
  })
})
