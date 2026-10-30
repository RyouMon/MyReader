import { beforeEach, describe, expect, it, vi } from "vitest"
import { Channel, invoke } from "@tauri-apps/api/core"
import { mockIPC } from "@tauri-apps/api/mocks"
import type { LlmStreamEventDto } from "../tauri-specta"
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

it("keeps draft progress request-scoped and detaches it after the command settles", async () => {
  mockIPC(() => undefined)
  vi.mocked(invoke).mockReset()
  let finish!: (value: unknown[]) => void
  vi.mocked(invoke).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const onProgress = vi.fn()
  const request = {
    book: { bookId: 1, title: "Book", authors: [], language: "zh" },
    input: { kind: "prompt" as const, prompt: "Cast" },
  }
  const result = api.draftBookCharacters("library", request, onProgress)
  const channel = (
    vi.mocked(invoke).mock.calls[0]![1] as {
      onProgress: Channel<LlmStreamEventDto>
    }
  ).onProgress
  expect(vi.mocked(invoke).mock.calls[0]![0]).toBe("draft_book_characters")
  channel.onmessage({ kind: "text", delta: "林岚" })
  expect(onProgress).toHaveBeenCalledExactlyOnceWith({
    kind: "text",
    delta: "林岚",
  })
  finish([])
  await expect(result).resolves.toEqual([])
  channel.onmessage({ kind: "text", delta: "late" })
  expect(onProgress).toHaveBeenCalledOnce()
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
