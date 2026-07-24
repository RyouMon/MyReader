import { describe, expect, it } from "vitest"
import { formatApiError } from "../tauri-api"

describe("formatApiError", () => {
  it("should preserve the error kind and message when a Tauri command fails", () => {
    const error = new Error("DATABASE_ERROR: disk I/O error")
    ;(error as Error & { kind: string }).kind = "Database"

    expect(formatApiError(error)).toBe(
      "Database: DATABASE_ERROR: disk I/O error",
    )
  })
})
