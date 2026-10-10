import { describe, expect, it } from "vitest"
import { appendErrorDetail } from "../src/error-detail"

describe("error details", () => {
  it("appends the original type and message after localized guidance", () => {
    expect(
      appendErrorDetail("请重试。", new TypeError("Failed to fetch")),
    ).toBe("请重试。\nTypeError: Failed to fetch")
    expect(
      appendErrorDetail("Sign in again.", {
        tag: "Credential",
        message: "HTTP 401",
      }),
    ).toBe("Sign in again.\nCredential: HTTP 401")
    expect(
      appendErrorDetail("Sign in again.", {
        kind: "Credential",
        message: "HTTP 401",
      }),
    ).toBe("Sign in again.\nCredential: HTTP 401")
  })

  it("preserves underlying causes and handles repeated or cyclic errors", () => {
    const error = Object.assign(new Error("Request failed"), {
      cause: { code: -1001, message: "Timed out", cause: undefined as unknown },
    })
    error.cause.cause = error
    expect(appendErrorDetail("Try again.", error)).toBe(
      "Try again.\nError: Request failed\n-1001: Timed out",
    )
    expect(
      appendErrorDetail("Try again.", {
        kind: "Io",
        message: "offline",
        cause: { kind: "Io", message: "offline" },
      }),
    ).toBe("Try again.\nIo: offline")
  })

  it("keeps legacy messages and omits unavailable diagnostics", () => {
    expect(appendErrorDetail("Try again.", "RAW_ERROR\nline 2")).toBe(
      "Try again.\nRAW_ERROR\nline 2",
    )
    for (const error of [undefined, null, {}, { message: "" }]) {
      expect(appendErrorDetail("Try again.", error)).toBe("Try again.")
    }
  })
})
