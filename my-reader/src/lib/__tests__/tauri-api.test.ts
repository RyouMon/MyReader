import { beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { api, formatApiError } from "../tauri-api"

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
  invoke: vi.fn(),
}))

describe("formatApiError", () => {
  it("should preserve the error kind and message when a Tauri command fails", () => {
    const error = new Error("DATABASE_ERROR: disk I/O error")
    ;(error as Error & { kind: string }).kind = "Database"

    expect(formatApiError(error)).toBe(
      "Database: DATABASE_ERROR: disk I/O error",
    )
  })
})

describe("native reader sharing", () => {
  beforeEach(() => vi.mocked(invoke).mockReset())

  it("passes all visible images to one native share request", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined)
    await api.shareReaderImages(["/cache/Book-2.jpg", "/cache/Book-3.jpg"])
    expect(invoke).toHaveBeenCalledExactlyOnceWith(
      "plugin:vnidrop-share|share",
      { options: { filePaths: ["/cache/Book-2.jpg", "/cache/Book-3.jpg"] } },
    )
  })

  it("accepts Windows picker dismissal but propagates real sharing failures", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(
      "Share timed out waiting for DataRequested event",
    )
    await expect(
      api.shareReaderImages(["/cache/Book-2.jpg"]),
    ).resolves.toBeUndefined()
    const error = new Error("File is no longer accessible")
    vi.mocked(invoke).mockRejectedValueOnce(error)
    await expect(api.shareReaderImages(["/cache/Book-2.jpg"])).rejects.toBe(
      error,
    )
  })
})
