import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { PropsWithChildren } from "react"
import { beforeEach, expect, it, vi } from "vitest"
import { api } from "@/lib/tauri-api"
import type { BookCharacterDto, LlmStreamEventDto } from "@/lib/tauri-specta"
import { useCharacterDraft } from "../use-character-draft"

vi.mock("@/lib/tauri-api", () => ({ api: { draftBookCharacters: vi.fn() } }))

const request = {
  book: { bookId: 1, title: "Book", authors: [], language: "zh" },
  input: { kind: "prompt" as const, prompt: "林岚：旅人。" },
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return renderHook(({ bookId }) => useCharacterDraft("library", bookId), {
    initialProps: { bookId: 1 },
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

function pending() {
  let emit!: (event: LlmStreamEventDto) => void
  let resolve!: (value: BookCharacterDto[]) => void
  let reject!: (error: Error) => void
  vi.mocked(api.draftBookCharacters).mockImplementationOnce(
    (_library, _request, onProgress) => {
      emit = onProgress!
      return new Promise((success, failure) => {
        resolve = success
        reject = failure
      })
    },
  )
  return {
    emit: (event: LlmStreamEventDto) => emit(event),
    finish: () => resolve([]),
    fail: () => reject(new Error("LLM_TIMEOUT")),
  }
}

beforeEach(() => vi.resetAllMocks())

it("shows real output before completion, bounds its tail and resets across batches", async () => {
  const stream = pending()
  const { result } = mount()
  act(() => result.current.draftCharacters.mutate(request))
  await waitFor(() => expect(api.draftBookCharacters).toHaveBeenCalledOnce())
  act(() => stream.emit({ kind: "reasoning", delta: "正在核对" }))
  act(() => stream.emit({ kind: "reasoning", delta: "人物介绍" }))
  expect(result.current.draftProgress).toBe("正在核对人物介绍")
  expect(result.current.draftCharacters.isPending).toBe(true)
  expect(result.current.draftCharacters.data).toBeUndefined()
  act(() => stream.emit({ kind: "text", delta: "人物：" }))
  expect(result.current.draftProgress).toBe("人物：")
  act(() => stream.emit({ kind: "text", delta: "真昼😀".repeat(1000) }))
  expect(Array.from(result.current.draftProgress)).toHaveLength(2048)
  expect(result.current.draftProgress.endsWith("真昼😀")).toBe(true)
  act(() => stream.emit({ kind: "started" }))
  expect(result.current.draftProgress).toBe("")
  act(() => stream.emit({ kind: "reasoning", delta: "下一段" }))
  await act(async () => stream.finish())
  await waitFor(() =>
    expect(result.current.draftCharacters.isSuccess).toBe(true),
  )
  expect(result.current.draftProgress).toBe("")
  act(() => stream.emit({ kind: "text", delta: "late" }))
  expect(result.current.draftProgress).toBe("")
})

it("clears failures and ignores late output from retries, another book and an unmounted view", async () => {
  const first = pending()
  const { result, rerender, unmount } = mount()
  act(() => result.current.draftCharacters.mutate(request))
  await waitFor(() => expect(api.draftBookCharacters).toHaveBeenCalledOnce())
  act(() => first.emit({ kind: "text", delta: "partial" }))
  await act(async () => first.fail())
  await waitFor(() => expect(result.current.draftCharacters.isError).toBe(true))
  expect(result.current.draftProgress).toBe("")
  expect(result.current.draftCharacters.data).toBeUndefined()
  const second = pending()
  act(() => result.current.draftCharacters.mutate(request))
  await waitFor(() => expect(api.draftBookCharacters).toHaveBeenCalledTimes(2))
  act(() => second.emit({ kind: "text", delta: "current" }))
  act(() => first.emit({ kind: "text", delta: "stale" }))
  expect(result.current.draftProgress).toBe("current")
  rerender({ bookId: 2 })
  act(() => second.emit({ kind: "text", delta: "other book" }))
  expect(result.current.draftProgress).toBe("")
  unmount()
  await act(async () => {
    second.emit({ kind: "text", delta: "unmounted" })
    second.finish()
  })
})

it("aborts a draft, clears pending output and ignores its late result when restarted", async () => {
  const first = pending()
  const { result } = mount()
  const imported = vi.fn()
  act(() =>
    result.current.draftCharacters.mutate(request, { onSuccess: imported }),
  )
  await waitFor(() => expect(api.draftBookCharacters).toHaveBeenCalledOnce())
  const signal = vi.mocked(api.draftBookCharacters).mock.calls[0]![3]!
  act(() => first.emit({ kind: "text", delta: "partial" }))
  act(() => result.current.cancelDraft())
  expect(signal.aborted).toBe(true)
  expect(result.current.draftProgress).toBe("")
  expect(result.current.draftCharacters.isPending).toBe(false)
  const second = pending()
  act(() => result.current.draftCharacters.mutate(request))
  await waitFor(() => expect(api.draftBookCharacters).toHaveBeenCalledTimes(2))
  act(() => second.emit({ kind: "text", delta: "new" }))
  await act(async () => {
    first.emit({ kind: "text", delta: "stale" })
    first.finish()
  })
  expect(imported).not.toHaveBeenCalled()
  expect(result.current.draftProgress).toBe("new")
  expect(result.current.draftCharacters.isPending).toBe(true)
  await act(async () => second.finish())
  await waitFor(() =>
    expect(result.current.draftCharacters.isSuccess).toBe(true),
  )
})
